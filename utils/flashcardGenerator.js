// Shared flashcard generation from curriculum, used by both the lecturer's
// manual "Generate" button (routes/flashcards.js) and the automatic generation
// that fires the moment attendance is taken (utils/flashcardAutoGen.js).
const { generateContent } = require('./claude');

// Build `count` validated MCQ cards from one curriculum entry (a single day).
async function generateCardsForEntry(entry, week, count) {
  const source =
    `Topic: ${entry.topic}\nKey points: ${(entry.subtopics || []).join('; ')}\n` +
    `Objectives: ${entry.objectives}\nTools: ${(entry.resources || []).join(', ')}`;
  const prompt =
    `You are creating revision flashcards for a practical, hands-on film and video bootcamp. ` +
    `Using ONLY the curriculum notes below, write exactly ${count} multiple-choice questions that test real understanding of the key concepts and practical skills. ` +
    `Each question must have exactly 4 distinct options with one clearly correct answer, plus a one-sentence explanation. ` +
    `Keep them clear and practical for beginners; avoid trick questions.\n\n` +
    `CURRICULUM (Week ${week}, ${entry.day} - ${entry.topic}):\n${source}\n\n` +
    `Return ONLY a JSON array (no markdown) of this exact shape:\n` +
    `[{"question":"...","options":["...","...","...","..."],"correctAnswer":"<exact text of the correct option>","explanation":"..."}]`;

  // Generous max_tokens: adaptive thinking shares this budget with the ~15-question output.
  const raw = await generateContent({ prompt, maxOutputTokens: 8000 });
  let cards;
  try { cards = JSON.parse(raw); }
  catch { const m = raw.match(/\[[\s\S]*\]/); cards = m ? JSON.parse(m[0]) : null; }
  return (Array.isArray(cards) ? cards : []).filter(c =>
    c && typeof c.question === 'string' && Array.isArray(c.options) &&
    c.options.length >= 2 && c.correctAnswer && c.options.includes(c.correctAnswer)
  ).slice(0, count);
}

// A short "what was taught" recap (1–2 sentences) for the notification emails.
// Not a full summary — just the gist. Falls back to the curriculum objectives /
// subtopics if the model call fails, so a set is never left without context.
async function generateLessonSummary(entry, week) {
  const fallback = (entry.objectives && entry.objectives.trim())
    || (Array.isArray(entry.subtopics) && entry.subtopics.length ? entry.subtopics.join(', ') : '')
    || `Today's class covered ${entry.topic}.`;
  try {
    const prompt =
      `In 1–2 short sentences (max 35 words), write a friendly recap of what students learned in this class. ` +
      `Plain text only, no preamble, no markdown, second person ("you learned…").\n\n` +
      `Topic: ${entry.topic}\n` +
      `Key points: ${(entry.subtopics || []).join('; ')}\n` +
      `Objectives: ${entry.objectives || ''}`;
    const text = await generateContent({ prompt, maxOutputTokens: 1200 });
    const recap = (text || '').trim().replace(/^["']|["']$/g, '');
    return recap || fallback;
  } catch {
    return fallback;
  }
}

module.exports = { generateCardsForEntry, generateLessonSummary };
