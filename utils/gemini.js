// Minimal Gemini (generativelanguage) helper for structured generation.
// Mirrors the request style used by routes/chat.js but generic and reusable.
const https = require('https');

const MODEL = 'gemini-2.5-flash';

// generateContent({ prompt, system?, maxOutputTokens?, temperature?, json? }) → Promise<string>
function generateContent({ prompt, system, maxOutputTokens = 2048, temperature = 0.4, json = false }) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return reject(new Error('GEMINI_API_KEY is not set'));

    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens, temperature },
    };
    if (system) payload.systemInstruction = { parts: [{ text: system }] };
    if (json) payload.generationConfig.responseMimeType = 'application/json';

    const body = JSON.stringify(payload);
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
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

module.exports = { generateContent };
