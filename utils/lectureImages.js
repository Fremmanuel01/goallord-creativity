// Lecture image generation.
// Generates the AI images a lecture needs (≈8 for Film, ≈5 for Programming),
// hosts them on Cloudinary, and writes image_url back into the slide JSON.
// Provider order: Replicate (Flux Schnell, ~$0.003/image) when REPLICATE_API_TOKEN
// is set, then OpenAI GPT Image, then Gemini "Nano Banana". Per-slide failures are
// non-fatal — the slide just renders without a photo. Only image_required slides,
// capped per course.
const https = require('https');
const cloudinary = require('../lib/cloudinary');
const { IMAGE_LIMITS } = require('./lectureGenerator');

const IMAGE_LAYOUTS = ['full_image_overlay', 'image_left_text_right', 'image_right_text_left'];

// ── Providers (raw HTTPS, no SDK) ────────────────────────────
// Each resolves to { url } or { b64 } plus the model id; Cloudinary ingests either.

// Replicate JSON POST helper. With `Prefer: wait` the API blocks up to ~60s and
// returns the finished prediction; if it's still processing we poll the get URL.
function replicatePost(path, payload) {
  return new Promise((resolve, reject) => {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return reject(new Error('REPLICATE_API_TOKEN not set'));
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.replicate.com', path, method: 'POST',
      headers: {
        'Content-Type': 'application/json', Authorization: 'Bearer ' + token,
        Prefer: 'wait', 'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let d = ''; res.on('data', (c) => d += c); res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('Replicate: bad JSON ' + d.slice(0, 160))); }
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}
function replicateGet(url) {
  return new Promise((resolve, reject) => {
    const token = process.env.REPLICATE_API_TOKEN;
    https.get(url, { headers: { Authorization: 'Bearer ' + token } }, (res) => {
      let d = ''; res.on('data', (c) => d += c); res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function replicateImage(prompt) {
  // Flux Schnell (~$0.003/image) is ~30x cheaper than Ideogram v3 Quality and
  // plenty for educational illustrations — text-in-image is banned anyway, which
  // was Ideogram's only edge. Override with REPLICATE_IMAGE_MODEL if needed
  // (e.g. black-forest-labs/flux-dev for a higher-end look).
  const model = process.env.REPLICATE_IMAGE_MODEL || 'black-forest-labs/flux-schnell';
  // Model-family-specific inputs: unknown keys fail Replicate's input validation.
  const input = { prompt, aspect_ratio: '16:9' };
  if (/ideogram/i.test(model)) input.magic_prompt_option = 'Auto';
  if (/flux/i.test(model)) { input.output_format = 'jpg'; input.output_quality = 90; }
  // API errors (throttling, auth, validation) come back with a numeric `status`
  // instead of a prediction's string status. Burst limits are small, so back off
  // and retry on 429 rather than burning a fallback provider per throttled slide.
  let pred;
  for (let attempt = 0; ; attempt++) {
    pred = await replicatePost(`/v1/models/${model}/predictions`, { input });
    if (pred && pred.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 11000 * (attempt + 1)));
      continue;
    }
    break;
  }
  if (pred.error || typeof pred.status === 'number') {
    throw new Error('Replicate: ' + (pred.detail || pred.error || ('HTTP ' + pred.status)));
  }
  // Poll if not finished within the sync window.
  for (let i = 0; i < 30 && pred.status && !['succeeded', 'failed', 'canceled'].includes(pred.status); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    pred = await replicateGet(pred.urls && pred.urls.get);
  }
  if (pred.status !== 'succeeded') throw new Error('Replicate: ' + (pred.error || pred.status || 'no output'));
  const out = pred.output;
  const url = Array.isArray(out) ? out[0] : out;
  if (!url) throw new Error('Replicate: empty output');
  return { url, model };
}

function openaiImage(prompt) {
  return new Promise((resolve, reject) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return reject(new Error('OPENAI_API_KEY not set'));
    const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
    const body = JSON.stringify({ model, prompt, size: '1536x1024', n: 1 });
    const req = https.request({
      hostname: 'api.openai.com', path: '/v1/images/generations', method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = ''; res.on('data', (c) => d += c); res.on('end', () => {
        try { const j = JSON.parse(d); const b64 = j && j.data && j.data[0] && j.data[0].b64_json;
          if (!b64) return reject(new Error('OpenAI image: ' + ((j.error && j.error.message) || d.slice(0, 180))));
          resolve({ b64, model });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

function geminiImage(prompt) {
  return new Promise((resolve, reject) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return reject(new Error('GEMINI_API_KEY not set'));
    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
    const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${key}`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = ''; res.on('data', (c) => d += c); res.on('end', () => {
        try { const j = JSON.parse(d);
          const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
          const img = parts.find((p) => p.inlineData || p.inline_data);
          const b64 = img && ((img.inlineData && img.inlineData.data) || (img.inline_data && img.inline_data.data));
          if (!b64) return reject(new Error('Gemini image: ' + ((j.error && j.error.message) || JSON.stringify(j).slice(0, 180))));
          resolve({ b64, model });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

// Try providers in order of preference, falling back on failure. Returns
// { url | b64, model }.
async function generateImage(prompt) {
  const chain = [];
  if (process.env.REPLICATE_API_TOKEN) chain.push(['Replicate', replicateImage]);
  if (process.env.OPENAI_API_KEY)      chain.push(['OpenAI', openaiImage]);
  if (process.env.GEMINI_API_KEY)      chain.push(['Gemini', geminiImage]);
  if (!chain.length) throw new Error('No image provider configured (set REPLICATE_API_TOKEN, OPENAI_API_KEY or GEMINI_API_KEY)');
  let lastErr;
  for (let i = 0; i < chain.length; i++) {
    const [name, fn] = chain[i];
    try { return await fn(prompt); }
    catch (e) { lastErr = e; if (i < chain.length - 1) console.warn(`[LectureImages] ${name} failed, falling back:`, e.message); }
  }
  throw lastErr;
}

// Cloudinary ingests a remote URL or a base64 data URI equally well.
async function uploadImage({ url, b64, publicId }) {
  const src = url || `data:image/png;base64,${b64}`;
  const res = await cloudinary.uploader.upload(src, {
    folder: 'goallord/lectures', public_id: publicId, overwrite: true, resource_type: 'image',
  });
  return res.secure_url;
}

// Augment the AI's image_prompt with a course-appropriate style + a hard "no text"
// instruction (text is overlaid by the portal, never baked into the image).
function buildImagePrompt(slide, courseType) {
  const style = courseType === 'Film'
    ? 'Photorealistic, sharp, well-lit documentary photograph that CLEARLY demonstrates the concept; a believable film-school set or shoot with students/crew and real gear where relevant; crisp focus on the subject, uncluttered, textbook-clear, natural detail, 16:9.'
    : 'Clean modern tech concept illustration, flat vector style, soft palette, lots of negative space, 16:9.';
  const neg = slide.negative_prompt || 'text, words, captions, letters, logos, watermark, UI';
  return `${slide.image_prompt}\n\nStyle: ${style}\nDo NOT render any text, letters, words, captions, labels, logos or UI. Leave clean empty space for text overlay. Avoid: ${neg}.`;
}

// Choose which slides get images: the model's image_required ones, capped at max,
// then topped up to the course DEFAULT so every deck carries a solid set of clear
// instructional photos — only from photo-suitable layouts (never force a
// diagram/code slide to become a photo).
function selectImageSlides(slides, courseType) {
  const lim = IMAGE_LIMITS[courseType] || IMAGE_LIMITS.Programming;
  const chosen = new Set();
  for (const s of slides) {
    if (s.image_required && chosen.size < lim.max) chosen.add(s.slide_number);
  }
  if (chosen.size < lim.default) {
    for (const s of slides) {
      if (chosen.size >= lim.default) break;
      if (!chosen.has(s.slide_number) && IMAGE_LAYOUTS.includes(s.layout_type)) chosen.add(s.slide_number);
    }
  }
  return chosen;
}

// ── Public: generate all images for a lecture's slides ───────
// Mutates a copy of `slides`, returns { slides, generated, failed, provider }.
async function generateLectureImages({ lectureId, courseType, slides }, { force = false } = {}) {
  const want = selectImageSlides(slides, courseType);
  let generated = 0, failed = 0, provider = '';
  const out = slides.map((s) => ({ ...s }));

  for (const s of out) {
    s.image_required = want.has(s.slide_number); // reconcile flags with the budget
    if (!s.image_required) continue;
    if (s.image_url && !force) { generated++; continue; } // cache
    // Pace requests: Replicate burst limits are small, and 8 back-to-back
    // creates get throttled even when the per-minute budget is fine.
    if (generated + failed > 0) await new Promise((r) => setTimeout(r, 3000));
    try {
      const { url, b64, model } = await generateImage(buildImagePrompt(s, courseType));
      s.image_url = await uploadImage({ url, b64, publicId: `lecture_${lectureId}_s${s.slide_number}` });
      provider = model; generated++;
    } catch (e) {
      failed++;
      s.image_url = s.image_url || null; // leave placeholder
      console.error(`[LectureImages] slide ${s.slide_number} failed:`, e.message);
    }
  }
  return { slides: out, generated, failed, provider };
}

// Regenerate one slide's image (teacher "regenerate slide" action).
async function regenerateSlideImage({ lectureId, courseType, slide }) {
  const { url, b64, model } = await generateImage(buildImagePrompt(slide, courseType));
  const hosted = await uploadImage({ url, b64, publicId: `lecture_${lectureId}_s${slide.slide_number}` });
  return { image_url: hosted, model };
}

module.exports = { generateLectureImages, regenerateSlideImage, selectImageSlides, buildImagePrompt };
