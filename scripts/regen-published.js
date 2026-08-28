// One-off: regenerate every currently-published lecture with the new illustrated
// generator, then quietly republish it (copy the new slides into the published
// copy, status 'republished', NO student notification) so there is zero downtime
// and the upgrade is seamless. Run: node scripts/regen-published.js
require('dotenv').config();
const supabase = require('../lib/supabase');
const { generateForBatchDay } = require('../utils/lectureGenerator');

(async () => {
  const { data: lectures, error } = await supabase.from('lectures')
    .select('id, batch_id, week, day, status, lecture_title')
    .in('status', ['published', 'republished', 'edited_after_publishing']);
  if (error) { console.error('query failed:', error.message); process.exit(1); }
  console.log(`Regenerating ${lectures.length} published lecture(s)…`);

  for (const l of lectures) {
    const tag = `wk${l.week} ${l.day} "${l.lecture_title}"`;
    try {
      const t0 = Date.now();
      const fresh = await generateForBatchDay({ batchId: l.batch_id, week: l.week, day: l.day, force: true });
      const slides = fresh.slides || [];
      const illus = slides.filter(s => s.layout_type === 'illustration' && s.svg).length;
      const imgs = slides.filter(s => s.image_url).length;
      // Quiet republish: restore student visibility with the upgraded deck.
      await supabase.from('lectures').update({
        published_slides: fresh.slides, published_notes: fresh.lesson_notes,
        status: 'republished', republished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', fresh.id);
      console.log(`OK  ${tag} — ${slides.length} slides, ${illus} illustrations, ${imgs} photos, republished (${((Date.now()-t0)/1000).toFixed(0)}s)`);
    } catch (e) {
      console.error(`FAIL ${tag} — ${e.message} (left as-is)`);
    }
  }
  console.log('Done.');
  process.exit(0);
})();
