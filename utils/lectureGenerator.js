// Lecture generation.
// The day before a class, build a full lecture (slides + lesson notes) from the
// curriculum entry with ONE Claude text call, validate/normalise the JSON, and
// save it as 'pending_review' for the teacher to edit and publish. Image
// generation is a separate, later step — slides come back with image_required
// flags but no image_url yet. Best-effort and idempotent (one lecture per slot).
const supabase        = require('../lib/supabase');
const lecturesDb      = require('../db/lectures');
const notificationsDb = require('../db/notifications');
const { generateDetailed } = require('./claude');
const { dateForWeekDay, todayWAT, courseTypeFor } = require('./schedule');

// Per-course image budget (enforced server-side regardless of model output).
// Flux Schnell costs ~$0.003/image, so even a 10-image Film deck is ~3 cents —
// budgets are sized so slides look like slides, not to pinch pennies.
const IMAGE_LIMITS = {
  Film:        { min: 6, max: 10, default: 8 },
  Programming: { min: 4, max: 6,  default: 5 },
};
const ANIMATIONS = ['fade', 'slide_up', 'panel_reveal', 'timeline_reveal', 'code_reveal', 'diagram_build', 'before_after_reveal', 'none'];
const LAYOUTS = ['title', 'image_left_text_right', 'image_right_text_left', 'full_image_overlay', 'cards_grid', 'comparison', 'timeline', 'flowchart', 'code_demo', 'diagram', 'lesson_summary'];
const SLIDE_MIN = 10, SLIDE_MAX = 15;

// ── Prompt ───────────────────────────────────────────────────
function buildPrompt(ctx) {
  const { courseType, courseTitle, lectureTitle, lectureDate, week, day, subtopics, objectives, resources } = ctx;
  const lim = IMAGE_LIMITS[courseType] || IMAGE_LIMITS.Programming;

  const filmStyle =
    `This is a FILM SCHOOL / VIDEOGRAPHY class. Slides must be pictorial, cinematic, clean, practical and visual — suited to camera, lighting, sound, editing, storytelling, directing and production. ` +
    `Use real filmmaking examples (camera moves, shot composition, lighting setups, sound capture, continuity, editing timelines, storyboards, production workflow). ` +
    `This course is image-led: mark image_required on the slides a photo teaches best — camera angles, shot composition, lighting setups, sound setup, sets and crew at work, editing suites, storyboards.`;
  const progStyle =
    `This is a PROGRAMMING class. Slides must be clean, structured, practical, code-friendly and beginner-friendly. ` +
    `Include short code examples where useful and use diagrams/flowcharts/tables for concepts. Use real coding, software-development, debugging and project examples. ` +
    `Mark image_required on concept slides where an illustration teaches best: software architecture, frontend/backend flow, database relationships, API request flow, debugging process, project workflow, app structure. Code, flowcharts and diagrams stay as HTML layouts, never images.`;

  return (
`You are an expert ${courseType === 'Film' ? 'film-school' : 'programming'} bootcamp instructor and slide designer.
Create ONE complete lecture (web slides + readable lesson notes) for beginner students, using ONLY the curriculum below.

${courseType === 'Film' ? filmStyle : progStyle}

RULES
- Produce between ${SLIDE_MIN} and ${SLIDE_MAX} slides.
- SLIDES ARE NOT LESSON NOTES. A slide carries at most ~30 words of visible text. Write "on_slide_text" as 3-5 punchy fragments of max 8 words each, ONE PER LINE (separate with \\n) — never sentences stacked into paragraphs. For 'title' and 'full_image_overlay' layouts use ONE short line.
- "main_explanation" is what the teacher SAYS while this slide is up (2-4 sentences). Students only see it behind an "Explain more" toggle — never rely on it being visible, and never repeat on_slide_text inside it.
- Mark EXACTLY ${lim.default} slides as "image_required": true — the moments best taught visually. All other slides MUST be "image_required": false and use a structured layout (cards_grid, comparison, timeline, flowchart, diagram, code_demo, lesson_summary) — avoid plain text-only slides.
- For image slides: write a vivid "image_prompt" describing ONE clear subject with setting, lighting and mood, and a "negative_prompt" of "text, words, captions, letters, logos, watermark, UI". Never bake text into images — the portal overlays real text.
- "animation_type" must be one of: ${ANIMATIONS.join(', ')}.
- "layout_type" must be one of: ${LAYOUTS.join(', ')}.
- Lesson notes are the DEEP reading material, read before class: intro, main sections (with key_points), important terms, practical examples and a summary. Full-detail teaching lives in the notes; the summarized visual version lives on the slides.

CURRICULUM
- Course: ${courseTitle} (${courseType})
- Lecture: ${lectureTitle}  ·  Week ${week}, ${day}  ·  ${lectureDate || 'TBD'}
- Objectives: ${objectives || '(none provided)'}
- Subtopics: ${(subtopics || []).map(s => '• ' + s).join('  ') || '(none provided)'}
- Tools/Resources: ${(resources || []).join(', ') || '(none provided)'}

Return ONLY valid JSON (no markdown fences). Do NOT include editable_blocks (the portal adds those). Use EXACTLY this shape:
{"lecture_package":{"course_type":"${courseType}","course_title":"${courseTitle}","lecture_title":"${lectureTitle}","lecture_date":"${lectureDate || ''}","student_level":"Beginner","slides":[{"slide_number":1,"slide_title":"","slide_type":"","on_slide_text":"","main_explanation":"","visual_type":"","visual_description":"","image_required":false,"image_prompt":"","negative_prompt":"","animation_type":"fade","layout_type":"title"}],"lesson_notes":{"title":"","introduction":"","main_sections":[{"heading":"","content":"","key_points":[]}],"important_terms":[{"term":"","meaning":""}],"practical_examples":[],"summary":""}}}`
  );
}

// ── Parse + normalise ────────────────────────────────────────
function parseJson(raw) {
  try { return JSON.parse(raw); }
  catch { const m = raw.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch {} } }
  return null;
}

function blocksFrom(slide) {
  const b = Array.isArray(slide.editable_blocks) ? slide.editable_blocks.filter(x => x && x.block_id) : [];
  if (b.length) return b.map(x => ({ ...x, is_editable: x.is_editable !== false }));
  return [
    { block_id: 'title',       block_type: 'slide_title',      content: slide.slide_title || '',      is_editable: true },
    { block_id: 'main_text',   block_type: 'on_slide_text',    content: slide.on_slide_text || '',     is_editable: true },
    { block_id: 'explanation', block_type: 'main_explanation', content: slide.main_explanation || '',  is_editable: true },
  ];
}

// Clamp count, fix enums, synthesise blocks, and enforce the image cap.
function validatePackage(pkg, courseType) {
  const lp = pkg && pkg.lecture_package;
  if (!lp || !Array.isArray(lp.slides) || !lp.slides.length) {
    throw new Error('model did not return a usable lecture_package.slides array');
  }
  const lim = IMAGE_LIMITS[courseType] || IMAGE_LIMITS.Programming;

  let slides = lp.slides.slice(0, SLIDE_MAX).map((s, i) => ({
    slide_number: i + 1,
    slide_title: String(s.slide_title || '').trim(),
    slide_type: String(s.slide_type || 'content').trim(),
    on_slide_text: String(s.on_slide_text || '').trim(),
    main_explanation: String(s.main_explanation || '').trim(),
    visual_type: String(s.visual_type || '').trim(),
    visual_description: String(s.visual_description || '').trim(),
    image_required: s.image_required === true,
    image_prompt: String(s.image_prompt || '').trim(),
    negative_prompt: String(s.negative_prompt || '').trim(),
    image_url: typeof s.image_url === 'string' ? s.image_url : null,
    animation_type: ANIMATIONS.includes(s.animation_type) ? s.animation_type : 'fade',
    layout_type: LAYOUTS.includes(s.layout_type) ? s.layout_type : 'cards_grid',
    editable_blocks: blocksFrom(s),
  }));

  // Enforce the per-course image cap: keep the first `max` image_required slides.
  let kept = 0;
  for (const s of slides) {
    if (s.image_required) {
      if (kept < lim.max) kept++;
      else s.image_required = false;
    }
  }

  const notes = lp.lesson_notes && typeof lp.lesson_notes === 'object' ? lp.lesson_notes : {};
  const lessonNotes = {
    title: String(notes.title || lp.lecture_title || '').trim(),
    introduction: String(notes.introduction || '').trim(),
    main_sections: Array.isArray(notes.main_sections) ? notes.main_sections.map(x => ({
      heading: String(x.heading || '').trim(),
      content: String(x.content || '').trim(),
      key_points: Array.isArray(x.key_points) ? x.key_points.map(String) : [],
    })) : [],
    important_terms: Array.isArray(notes.important_terms) ? notes.important_terms.map(x => ({
      term: String(x.term || '').trim(), meaning: String(x.meaning || '').trim(),
    })) : [],
    practical_examples: Array.isArray(notes.practical_examples) ? notes.practical_examples.map(String) : [],
    summary: String(notes.summary || '').trim(),
  };

  return {
    lecture_title: String(lp.lecture_title || '').trim(),
    slides,
    lesson_notes: lessonNotes,
    image_count: slides.filter(s => s.image_required).length,
    short: slides.length < SLIDE_MIN,
  };
}

// ── Helpers ──────────────────────────────────────────────────
async function lecturerForBatch(batchId) {
  const { data } = await supabase.from('lecturer_batches').select('lecturer_id').eq('batch_id', batchId).limit(1);
  return (data && data[0] && data[0].lecturer_id) || null;
}

async function notifyLecturers(batchId, lecture) {
  try {
    const { data: links } = await supabase.from('lecturer_batches').select('lecturer_id').eq('batch_id', batchId);
    const ids = (links || []).map(l => l.lecturer_id);
    if (!ids.length) return;
    await notificationsDb.insertMany(ids.map(id => ({
      recipient_id: id, recipient_type: 'Lecturer', type: 'lecture_pending',
      title: 'Lecture ready for review',
      message: `Slides & notes for "${lecture.lecture_title}" are ready to review and publish.`,
      link: '/lecturer-dashboard.html#lectures',
    })));
  } catch (e) { /* best-effort */ }
}

// ── Core: generate one lecture for a curriculum entry ────────
async function _generate(batch, entry, { force = false, premium = false } = {}) {
  const courseType = courseTypeFor(batch.track);
  const week = Number(entry.week);
  const day = entry.day;

  let lecture = await lecturesDb.findSlot(batch.id, week, day);
  if (lecture && !force && ['pending_review', 'published', 'edited_after_publishing', 'republished', 'generating'].includes(lecture.status)) {
    return lecture; // cache hit — don't regenerate
  }

  const startMs = batch.start_date ? new Date(batch.start_date + 'T00:00:00Z').getTime() : null;
  const startDow = startMs != null ? new Date(startMs).getUTCDay() : null;
  const lectureDate = startMs != null ? dateForWeekDay(startMs, startDow, week, day) : null;

  const base = {
    batch_id: batch.id, week, day, lecture_date: lectureDate,
    course_type: courseType, course_title: batch.name || batch.track || '',
    lecture_title: entry.topic || `Week ${week} ${day}`,
    premium: !!premium, status: 'generating',
  };
  lecture = lecture
    ? await lecturesDb.update(lecture.id, base)
    : await lecturesDb.create({ ...base, lecturer_id: await lecturerForBatch(batch.id) });

  try {
    const prompt = buildPrompt({
      courseType, courseTitle: base.course_title, lectureTitle: base.lecture_title,
      lectureDate, week, day,
      subtopics: entry.subtopics, objectives: entry.objectives, resources: entry.resources,
    });
    // Strict JSON: disable thinking so the whole budget goes to the output.
    const res = await generateDetailed({ prompt, maxOutputTokens: 20000, model: premium ? 'premium' : 'default', thinking: 'off' });
    const pkg = parseJson(res.text);
    const v = validatePackage(pkg, courseType);

    await lecturesDb.logAi({
      lecture_id: lecture.id, kind: 'lecture_text', model: res.model,
      input_tokens: res.inputTokens, output_tokens: res.outputTokens, ok: true,
      detail: `${v.slides.length} slides, ${v.image_count} image slot(s)${v.short ? ' (under 10 slides)' : ''}`,
    });

    // Image step (best-effort): generate the few AI images and host them on
    // Cloudinary. Lazy-required to avoid a circular import. If no image-capable
    // key/quota is available it fails gracefully — image slides keep image_url
    // null and render a placeholder; the lecture is still fully usable.
    let slides = v.slides;
    try {
      const { generateLectureImages } = require('./lectureImages');
      const r = await generateLectureImages({ lectureId: lecture.id, courseType, slides: v.slides }, {});
      slides = r.slides;
      await lecturesDb.logAi({
        lecture_id: lecture.id, kind: 'image', model: r.provider || '(none)',
        images: r.generated, ok: r.failed === 0,
        detail: `${r.generated} generated, ${r.failed} failed`,
      });
    } catch (e) {
      console.error('[Lectures] image step skipped:', e.message);
    }

    const saved = await lecturesDb.update(lecture.id, {
      lecture_title: v.lecture_title || base.lecture_title,
      slides, lesson_notes: v.lesson_notes,
      status: 'pending_review', generated_at: new Date().toISOString(),
    });
    await notifyLecturers(batch.id, saved);
    const imgCount = slides.filter(s => s.image_url).length;
    console.log(`[Lectures] generated "${saved.lecture_title}" for ${base.course_title} (${slides.length} slides, ${imgCount} images) → pending_review`);
    return saved;
  } catch (e) {
    await lecturesDb.update(lecture.id, { status: 'failed' }).catch(() => {});
    await lecturesDb.logAi({ lecture_id: lecture.id, kind: 'lecture_text', model: premium ? 'premium' : 'default', ok: false, detail: e.message });
    console.error(`[Lectures] generation failed for batch ${batch.id} week ${week} ${day}:`, e.message);
    throw e;
  }
}

// ── Public: cron sweep for tomorrow's classes ────────────────
async function runLectureGeneration() {
  const targetDate = todayWAT(1); // tomorrow
  const { data: batches } = await supabase.from('batches')
    .select('id, name, track, start_date').eq('is_active', true);
  let generated = 0, skipped = 0, failed = 0;

  for (const batch of batches || []) {
    if (!batch.start_date) continue;
    const startMs = new Date(batch.start_date + 'T00:00:00Z').getTime();
    const startDow = new Date(startMs).getUTCDay();
    const { data: entries } = await supabase.from('curriculum_entries')
      .select('week, day, topic, subtopics, objectives, resources').eq('batch_id', batch.id);
    const due = (entries || []).filter(e => dateForWeekDay(startMs, startDow, e.week, e.day) === targetDate);

    for (const entry of due) {
      try {
        const existing = await lecturesDb.findSlot(batch.id, Number(entry.week), entry.day);
        if (existing && existing.status !== 'failed') { skipped++; continue; }
        await _generate(batch, entry, {});
        generated++;
      } catch { failed++; }
    }
  }
  if (generated || failed) console.log(`[Lectures] sweep for ${targetDate}: generated ${generated}, skipped ${skipped}, failed ${failed}`);
  return { generated, skipped, failed };
}

// ── Public: manual generate for one slot (route / testing) ───
async function generateForBatchDay({ batchId, week, day, force = false, premium = false }) {
  const { data: batch } = await supabase.from('batches').select('id, name, track, start_date').eq('id', batchId).single();
  if (!batch) throw new Error('Batch not found');
  const { data: entry } = await supabase.from('curriculum_entries')
    .select('week, day, topic, subtopics, objectives, resources')
    .eq('batch_id', batchId).eq('week', Number(week)).eq('day', day).limit(1).maybeSingle();
  if (!entry) throw new Error('No curriculum entry for that week/day');
  return _generate(batch, entry, { force, premium });
}

module.exports = { runLectureGeneration, generateForBatchDay, validatePackage, buildPrompt, IMAGE_LIMITS };
