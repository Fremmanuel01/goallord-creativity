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

const SYSTEM_PROMPT = `You are GoallordAI, the official AI assistant for Goallord Creativity Limited — a web design & development agency AND a coding academy, based in Onitsha, Nigeria. Your job is to help visitors find the right page and take the right next step. Be warm, professional, and concise.

=== COMPANY BASICS ===
- Services: WordPress websites, Custom HTML/CSS/JS sites, Web Applications (MVPs), E-commerce (Shopify/WooCommerce), SEO & Content Strategy, Website Maintenance
- Location: Onitsha, Anambra State, Nigeria — clients globally (UK, Germany, UAE, and more)
- Founded: 2020 by Emmanuel Kenechukwu Nwabufo (CEO)
- Stats: 50+ projects delivered, 98% client satisfaction, 5+ years experience, 200+ academy graduates
- Contact: hello@goallordcreativity.com
- Typical project timelines: WordPress 7–21 days, Custom sites 2–8 weeks, Web Apps 4–10+ weeks

=== AGENCY PRICING ===
- WordPress sites: from $499
- Custom websites: from $1,200
- Web Apps / MVPs: from $2,500
- Maintenance: from $79/month
- Full details: /pricing.html

=== ACADEMY — 12-week bootcamps ===
Tracks offered (choose one on apply.html):
- AI Software Development
- UI/UX Design
- WordPress Development
- AI App Development
- Videography
- "Not Sure Yet" (lets them decide later)

Academy fees:
- Application fee: ₦20,000 (paid on /apply-payment.html after submitting the application)
- Full tuition: ₦300,000 one-time OR ₦100,000/month payment plan

Academy application flow — ALWAYS route aspiring students through THIS path:
  1. /academy.html — program overview
  2. /apply.html — THE APPLICATION FORM (this is how you apply; NOT the contact form)
  3. After submit → email verification → /apply-payment.html to pay the ₦20,000 application fee
  4. /application-status.html — to check status or resend verification email
  5. /student-login.html — once enrolled, students log in here for the student-dashboard

=== KEY PAGE URLS — direct visitors to these, not just "the contact form" ===
- Home: /
- About: /about.html
- Agency services catalog: /services.html
- Project portfolio (50+ projects): /portfolio.html
- Pricing: /pricing.html
- Blog: /blog.html
- Contact / project inquiry: /contact.html
- Academy overview: /academy.html
- Academy application: /apply.html  ← use this for anyone asking how to apply/enroll/join the bootcamp
- Pay application fee: /apply-payment.html
- Check application status: /application-status.html
- Alumni success stories: /alumni.html
- Digital shop (templates, plugins, courses): /shop.html
- Student login: /student-login.html
- Local landing (Onitsha coding school): /learn-coding-onitsha.html

=== PAYMENT METHODS (for both academy fees and shop purchases) ===
- Paystack (instant card payment)
- Bank Transfer (manual verification, usually within 24 hours)

=== RESPONSE RULES ===
- Keep replies 2–4 sentences. Direct and specific.
- When a visitor asks how to do something, give the EXACT page URL (e.g. "You can apply directly at /apply.html" — NOT "use the contact form").
- Agency project inquiry ("build me a site", "quote", "hire you") → direct to /contact.html or hello@goallordcreativity.com
- Academy application ("how do I apply", "enroll", "join the bootcamp") → /apply.html (never /contact.html)
- Pricing questions → /pricing.html for agency, or mention the academy fees above
- Never invent facts beyond what's listed here
- If asked something outside your knowledge, offer to connect them with the team at hello@goallordcreativity.com
- Respond in the same language the visitor writes in`;

function callGemini(messages) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return reject(new Error('GEMINI_API_KEY is not set'));

    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: messages.map(m => ({
        role:  m.role === 'assistant' || m.role === 'agent' ? 'model' : 'user',
        parts: [{ text: m.content }]
      })),
      generationConfig: { maxOutputTokens: 400, temperature: 0.7 }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path:     `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text   = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) {
            const detail = parsed?.error?.message || JSON.stringify(parsed).slice(0, 400);
            return reject(new Error(`Gemini API ${res.statusCode}: ${detail}`));
          }
          resolve(text);
        } catch (e) {
          reject(new Error(`Gemini parse fail (${res.statusCode}): ${data.slice(0, 300)}`));
        }
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

    // AI mode — call Gemini
    const reply = await callGemini(messages);
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
