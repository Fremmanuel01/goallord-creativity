const express        = require('express');
const AffiliateLink  = require('../models/AffiliateLink');
const AffiliateClick = require('../models/AffiliateClick');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/affiliate — list all links ──────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const links = await AffiliateLink.find().sort({ createdAt: -1 });
    res.json(links);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/affiliate/stats — aggregate click stats ────────────────────
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const totalLinks  = await AffiliateLink.countDocuments();
    const totalClicks = await AffiliateClick.countDocuments();
    const top = await AffiliateLink.findOne().sort({ totalClicks: -1 }).select('name slug totalClicks');
    // Last 30 days clicks by day
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recent = await AffiliateClick.find({ createdAt: { $gte: since } }).select('createdAt linkSlug');
    const byDay = {};
    recent.forEach(c => {
      const day = c.createdAt.toISOString().split('T')[0];
      byDay[day] = (byDay[day] || 0) + 1;
    });
    res.json({ totalLinks, totalClicks, top, byDay });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/affiliate/:slug/clicks — click breakdown for one link ───────
router.get('/:slug/clicks', requireAuth, async (req, res) => {
  try {
    const clicks = await AffiliateClick.find({ linkSlug: req.params.slug })
      .sort({ createdAt: -1 }).limit(500).select('postSlug device country createdAt');
    const byPost   = {};
    const byDevice = { mobile: 0, desktop: 0, tablet: 0 };
    const byDay    = {};
    clicks.forEach(c => {
      if (c.postSlug) byPost[c.postSlug]    = (byPost[c.postSlug] || 0) + 1;
      byDevice[c.device] = (byDevice[c.device] || 0) + 1;
      const day = c.createdAt.toISOString().split('T')[0];
      byDay[day] = (byDay[day] || 0) + 1;
    });
    res.json({ total: clicks.length, byPost, byDevice, byDay });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/affiliate ──────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const link = await AffiliateLink.create(req.body);
    res.status(201).json(link);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── PUT /api/affiliate/:slug ─────────────────────────────────────────────
router.put('/:slug', requireAuth, async (req, res) => {
  try {
    const link = await AffiliateLink.findOneAndUpdate({ slug: req.params.slug }, req.body, { new: true });
    if (!link) return res.status(404).json({ error: 'Not found' });
    res.json(link);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── DELETE /api/affiliate/:slug ──────────────────────────────────────────
router.delete('/:slug', requireAuth, async (req, res) => {
  try {
    await AffiliateLink.findOneAndDelete({ slug: req.params.slug });
    await AffiliateClick.deleteMany({ linkSlug: req.params.slug });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
