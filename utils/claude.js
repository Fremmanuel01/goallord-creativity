// Minimal Claude (Anthropic) helper for structured generation.
// Drop-in replacement for the previous Gemini-backed generateContent: same
// call shape ({ prompt, system?, maxOutputTokens? }) returning the model's
// text. Uses the official @anthropic-ai/sdk.
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-opus-4-8';

let client;
function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

// generateContent({ prompt, system?, maxOutputTokens? }) → Promise<string>
// Adaptive thinking is left on so the visible text block stays a clean final
// answer (Opus 4.8 may otherwise leak reasoning into the response). Note:
// thinking tokens count against max_tokens, so keep maxOutputTokens generous.
async function generateContent({ prompt, system, maxOutputTokens = 4096 }) {
  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxOutputTokens,
    thinking: { type: 'adaptive' },
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: prompt }],
  });

  if (message.stop_reason === 'refusal') {
    throw new Error('Claude declined to generate the requested content');
  }

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  if (!text) {
    throw new Error(`Claude returned no text (stop_reason: ${message.stop_reason})`);
  }
  return text;
}

module.exports = { generateContent };
