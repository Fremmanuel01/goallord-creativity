const express  = require('express');
const https    = require('https');
const router   = express.Router();
const conversationsDb = require('../db/conversations');
const rateLimit = require('express-rate-limit');
const xss = require('xss');

const chatLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    message: { error: 'Too many messages. Please slow down.' }
});

const SYSTEM_PROMPT = `You are GoallordAI, the official AI assistant for Goallord Creativity Limited — a full-service web design and development agency based in Onitsha, Anambra State, Nigeria.

You help website visitors learn about the agency's services, pricing, portfolio, and process. Be professional, warm, and concise.

Key facts:
- Services: WordPress websites, Custom HTML/CSS/JS sites, Web Applications (MVPs), E-commerce (Shopify/WooCommerce), SEO & Content Strategy, Website Maintenance
- Location: Onitsha, Nigeria — working globally (clients in UK, Germany, UAE and more)
- Founded: 2020 by Emmanuel Kenechukwu Nwabufo (CEO)
- Stats: 50+ projects delivered, 98% client satisfaction, 5+ years experience
- Academy: Goallord Academy has trained 200+ students in web design and development
- Pricing: WordPress from $499 | Custom websites from $1,200 | Web Apps from $2,500 | Maintenance from $79/month
- Contact: hello@goallordcreativity.com
- Typical timeline: WordPress 7–21 days, Custom sites 2–8 weeks, Web Apps 4–10+ weeks

Rules:
- Keep responses concise: 2–4 sentences max
- When users want to start a project, direct them to scroll down to the contact form or email hello@goallordcreativity.com
- Never make up facts not listed above
- If asked something outside your knowledge, say you'll connect them with the team
- Respond in the same language the user writes in`;

function callClaude(messages) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const body = JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 400,
      system:     SYSTEM_PROMPT,
      messages:   messages.map(m => ({
        role:    m.role === 'assistant' || m.role === 'agent' ? 'assistant' : 'user',
        content: m.content
      }))
    });

    const options = {
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers:  {
        'Content-Type':      'application/json',
        'Content-Length':    Buffer.byteLength(body),
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01'
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text   = parsed?.content?.[0]?.text;
          if (!text) return reject(new Error('Empty response'));
          resolve(text);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// POST /api/chat  — visitor sends a message
router.post('/', chatLimiter, async (req, res) => {
  const { messages, sessionId, visitorPage, visitorName, visitorEmail } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0 || !sessionId) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  // Validate message content
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || !lastMsg.content || typeof lastMsg.content !== 'string') {
    return res.status(400).json({ error: 'Invalid message format' });
  }
  if (lastMsg.content.length > 500) {
    return res.status(400).json({ error: 'Message too long (max 500 characters)' });
  }

  const io = req.app.get('io');

  // Sanitize visitor identity
  const safeVisitorName  = xss((visitorName  || '').trim());
  const safeVisitorEmail = (visitorEmail || '').toLowerCase().trim();

  try {
    // Upsert conversation
    let convo = await conversationsDb.findBySessionId(sessionId);
    if (!convo) {
      convo = await conversationsDb.create({
        session_id:    sessionId,
        visitor_page:  visitorPage  || '/',
        visitor_name:  safeVisitorName,
        visitor_email: safeVisitorEmail
      });
      convo.messages = [];
    } else {
      // Fill in identity if not already captured
      const updates = {};
      if (!convo.visitor_name  && safeVisitorName)  updates.visitor_name  = safeVisitorName;
      if (!convo.visitor_email && safeVisitorEmail) updates.visitor_email = safeVisitorEmail;
      if (Object.keys(updates).length > 0) {
        await conversationsDb.update(convo.id, updates);
        Object.assign(convo, updates);
      }
    }

    // Save latest user message (sanitized)
    if (lastMsg?.role === 'user') {
      await conversationsDb.addMessage(convo.id, { role: 'user', content: xss(lastMsg.content) });
      await conversationsDb.incrementUnread(convo.id);
    }

    // If a human agent has taken over — check if they've gone idle (5 min with no reply)
    if (convo.mode === 'human') {
      const lastAgentMsg = await conversationsDb.getLastAgentMessage(convo.id);
      const lastActivity = lastAgentMsg
        ? new Date(lastAgentMsg.timestamp || 0)
        : new Date(convo.updated_at || convo.created_at || 0);
      const idleMs = Date.now() - lastActivity.getTime();

      if (idleMs > 5 * 60 * 1000) {
        // Agent has been idle 5+ min — revert to AI silently
        await conversationsDb.update(convo.id, { mode: 'ai' });
        convo.mode = 'ai';
        if (io) io.to('agents').emit('mode:changed', { sessionId, mode: 'ai' });
        // Fall through to AI response below
      } else {
        if (io) io.to('agents').emit('visitor:message', {
          sessionId,
          visitorName:  convo.visitor_name  || '',
          visitorEmail: convo.visitor_email || '',
          message: { role: 'user', content: lastMsg.content, timestamp: new Date() }
        });
        return res.json({ reply: null, mode: 'human' });
      }
    }

    // AI mode — call Claude
    const reply = await callClaude(messages);
    await conversationsDb.addMessage(convo.id, { role: 'assistant', content: reply });

    // Notify dashboard in real-time
    if (io) {
      io.to('agents').emit('visitor:message', {
        sessionId,
        visitorName:  convo.visitor_name  || '',
        visitorEmail: convo.visitor_email || '',
        message: { role: 'user', content: lastMsg.content, timestamp: new Date() }
      });
      io.to('agents').emit('ai:reply', {
        sessionId,
        message: { role: 'assistant', content: reply, timestamp: new Date() }
      });
      // New conversation notification
      const refreshedConvo = await conversationsDb.findBySessionId(sessionId);
      if (refreshedConvo && (refreshedConvo.messages || []).length <= 2) {
        io.to('agents').emit('new:conversation', {
          sessionId,
          visitorName:  convo.visitor_name  || '',
          visitorEmail: convo.visitor_email || '',
          preview: lastMsg.content,
          timestamp: new Date()
        });
      }
    }

    res.json({ reply, mode: 'ai' });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'AI service error' });
  }
});

module.exports = router;
