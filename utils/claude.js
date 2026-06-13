// Minimal Claude (Anthropic) helper for structured generation.
// Drop-in replacement for the previous Gemini-backed generateContent: same
// call shape ({ prompt, system?, maxOutputTokens? }) returning the model's
// text. Uses the official @anthropic-ai/sdk.
const Anthropic = require('@anthropic-ai/sdk');

// Tiered models so callers can trade cost for quality:
//   default → everyday structured generation (flashcards, lectures)
//   premium → very important lectures ("Premium Generation")
//   small   → email copy, one-slide regenerations, short summaries
const MODELS = {
  default: 'claude-sonnet-4-6',
  premium: 'claude-opus-4-8',
  small:   'claude-haiku-4-5-20251001',
};
const MODEL = MODELS.default; // back-compat

let client;
function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

// generateContent({ prompt, system?, maxOutputTokens?, model? }) → Promise<string>
// `model` accepts a MODELS key ('default'|'premium'|'small') or a raw model id;
// omit it to keep the Sonnet default (so existing callers are unchanged).
// Adaptive thinking is left on so the visible text block stays a clean final
// answer. Note: thinking tokens count against max_tokens, so keep it generous.
async function generateContent({ prompt, system, maxOutputTokens = 4096, model }) {
  const res = await generateDetailed({ prompt, system, maxOutputTokens, model });
  return res.text;
}

// Like generateContent but also returns model id + token usage (for cost logs).
// `thinking` defaults to 'adaptive'; pass false/'off' for large strict-JSON
// outputs so reasoning tokens don't eat the max_tokens budget. `effort` maps to
// output_config.effort ('low'|'medium'|'high').
async function generateDetailed({ prompt, system, maxOutputTokens = 4096, model, thinking = 'adaptive', effort = 'medium' }) {
  const resolved = MODELS[model] || model || MODELS.default;
  const params = {
    model: resolved,
    max_tokens: maxOutputTokens,
    output_config: { effort },
    messages: [{ role: 'user', content: prompt }],
  };
  if (thinking && thinking !== 'off') params.thinking = { type: thinking === true ? 'adaptive' : thinking };
  if (system) params.system = system;
  // Large outputs can exceed the SDK's 10-minute non-streaming limit, so stream
  // and assemble the final message. finalMessage() returns the same shape.
  const message = maxOutputTokens >= 16000
    ? await getClient().messages.stream(params).finalMessage()
    : await getClient().messages.create(params);

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
  const u = message.usage || {};
  return { text, model: resolved, inputTokens: u.input_tokens || 0, outputTokens: u.output_tokens || 0 };
}

module.exports = { generateContent, generateDetailed, MODELS, MODEL };
