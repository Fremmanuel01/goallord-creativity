const express = require('express');
const https   = require('https');
const router  = express.Router();

const SYSTEM_PROMPT = `You are GoallordAI, the official AI assistant for Goallord Creativity Limited — a full-service web design and development agency based in Onitsha, Anambra State, Nigeria.

You help website visitors learn about the agency's services, pricing, portfolio, and process. Be professional, warm, and concise.

Key facts:
- Services: WordPress websites, Custom HTML/CSS/JS sites, Web Applications (MVPs), E-commerce (Shopify/WooCommerce), SEO & Digital Marketing, Website Maintenance
- Location: Onitsha, Nigeria — working globally (clients in UK, Germany, UAE and more)
- Founded: 2020 by Emmanuel Kenechukwu Nwabufo (CEO)
- Stats: 50+ projects delivered, 98% client satisfaction, 5+ years experience
- Academy: Goallord Academy has trained 200+ students in web design and development
- Pricing: WordPress from €499 | Custom websites from €1,200 | Web Apps from €2,500 | Maintenance from €79/month
- Contact: hello@goallordcreativity.com
- Typical timeline: WordPress 7–21 days, Custom sites 2–8 weeks, Web Apps 4–10+ weeks

Rules:
- Keep responses concise: 2–4 sentences max
- When users want to start a project, direct them to scroll down to the contact form or email hello@goallordcreativity.com
- Never make up facts not listed above
- If asked something outside your knowledge, say you'll connect them with the team
- Respond in the same language the user writes in`;

router.post('/', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages payload' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Chat service not configured' });
  }

  const body = JSON.stringify({
    model:      'claude-sonnet-4-5',
    max_tokens: 400,
    system:     SYSTEM_PROMPT,
    messages:   messages.map(m => ({
      role:    m.role === 'assistant' ? 'assistant' : 'user',
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

  const claudeReq = https.request(options, claudeRes => {
    let data = '';
    claudeRes.on('data', chunk => { data += chunk; });
    claudeRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const text   = parsed?.content?.[0]?.text;
        if (!text) return res.status(502).json({ error: 'Empty response from AI' });
        res.json({ reply: text });
      } catch (e) {
        res.status(502).json({ error: 'Failed to parse AI response' });
      }
    });
  });

  claudeReq.on('error', err => {
    console.error('Claude request error:', err);
    res.status(502).json({ error: 'AI service unavailable' });
  });

  claudeReq.write(body);
  claudeReq.end();
});

module.exports = router;
