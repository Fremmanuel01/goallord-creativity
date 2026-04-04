const express     = require('express');
const affiliateDb = require('../db/affiliate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/affiliate — list all links ──────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const links = await affiliateDb.findAllLinks();
    res.json(links);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/affiliate/stats — aggregate click stats ────────────────────
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const supabase = require('../lib/supabase');

    // Total links
    const { count: totalLinks, error: e1 } = await supabase.from('affiliate_links').select('id', { count: 'exact', head: true });
    if (e1) throw e1;

    // Total clicks
    const { count: totalClicks, error: e2 } = await supabase.from('affiliate_clicks').select('id', { count: 'exact', head: true });
    if (e2) throw e2;

    // Top link by clicks
    const { data: topArr, error: e3 } = await supabase.from('affiliate_links').select('name, slug, total_clicks').order('total_clicks', { ascending: false }).limit(1);
    if (e3) throw e3;
    const top = topArr && topArr[0] ? topArr[0] : null;

    // Last 30 days clicks by day
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const clicks = await affiliateDb.findClicks();
    const recent = clicks.filter(c => c.created_at >= since);
    const byDay = {};
    recent.forEach(c => {
      const day = new Date(c.created_at).toISOString().split('T')[0];
      byDay[day] = (byDay[day] || 0) + 1;
    });
    res.json({ totalLinks: totalLinks || 0, totalClicks: totalClicks || 0, top, byDay });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/affiliate/:slug/clicks — click breakdown for one link ───────
router.get('/:slug/clicks', requireAuth, async (req, res) => {
  try {
    const clicks = await affiliateDb.findClicks({ link_slug: req.params.slug });
    const limited = clicks.slice(0, 500);
    const byPost   = {};
    const byDevice = { mobile: 0, desktop: 0, tablet: 0 };
    const byDay    = {};
    limited.forEach(c => {
      if (c.post_slug) byPost[c.post_slug] = (byPost[c.post_slug] || 0) + 1;
      byDevice[c.device] = (byDevice[c.device] || 0) + 1;
      const day = new Date(c.created_at).toISOString().split('T')[0];
      byDay[day] = (byDay[day] || 0) + 1;
    });
    res.json({ total: limited.length, byPost, byDevice, byDay });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/affiliate ──────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const link = await affiliateDb.createLink(req.body);
    res.status(201).json(link);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── PUT /api/affiliate/:slug ─────────────────────────────────────────────
router.put('/:slug', requireAuth, async (req, res) => {
  try {
    const existing = await affiliateDb.findLinkBySlug(req.params.slug);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const link = await affiliateDb.updateLink(existing.id, req.body);
    res.json(link);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── DELETE /api/affiliate/:slug ──────────────────────────────────────────
router.delete('/:slug', requireAuth, async (req, res) => {
  try {
    const existing = await affiliateDb.findLinkBySlug(req.params.slug);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await affiliateDb.removeLink(existing.id);
    // Also delete clicks for this slug
    const supabase = require('../lib/supabase');
    await supabase.from('affiliate_clicks').delete().eq('link_slug', req.params.slug);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
