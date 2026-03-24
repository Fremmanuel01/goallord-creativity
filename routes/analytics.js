const express        = require('express');
const BlogPost       = require('../models/BlogPost');
const AffiliateClick = require('../models/AffiliateClick');
const AffiliateLink  = require('../models/AffiliateLink');
const Contact        = require('../models/Contact');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Helper — build a "last N days" byDay map with zero-fill
function buildDayMap(since) {
  const map = {};
  const now  = new Date();
  for (let i = 0; i <= 29; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (29 - i));
    map[d.toISOString().split('T')[0]] = 0;
  }
  return map;
}

// GET /api/analytics/summary — full dashboard analytics (protected)
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalPosts,
      totalViews,
      totalAffiliateClicks,
      totalContacts,
      topPosts,
      affClicks,
      contacts,
      topAffLinks,
    ] = await Promise.all([
      BlogPost.countDocuments({ published: true }),
      BlogPost.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]),
      AffiliateClick.countDocuments(),
      Contact.countDocuments(),

      // Top 10 posts by views
      BlogPost.find({ published: true }, 'slug title category views publishedAt')
        .sort({ views: -1 }).limit(10),

      // Affiliate clicks last 30 days
      AffiliateClick.find({ createdAt: { $gte: since } }).select('createdAt'),

      // Contact signups last 30 days
      Contact.find({ createdAt: { $gte: since } }).select('createdAt'),

      // Top 5 affiliate links
      AffiliateLink.find({}, 'slug name totalClicks category').sort({ totalClicks: -1 }).limit(5),
    ]);

    // Build day-by-day affiliate click trend
    const affByDay = buildDayMap(since);
    affClicks.forEach(c => {
      const day = c.createdAt.toISOString().split('T')[0];
      if (day in affByDay) affByDay[day]++;
    });

    // Build day-by-day contact trend
    const contactByDay = buildDayMap(since);
    contacts.forEach(c => {
      const day = c.createdAt.toISOString().split('T')[0];
      if (day in contactByDay) contactByDay[day]++;
    });

    res.json({
      totals: {
        posts:           totalPosts,
        views:           (totalViews[0]?.total) || 0,
        affiliateClicks: totalAffiliateClicks,
        contacts:        totalContacts,
      },
      topPosts:    topPosts,
      topAffLinks: topAffLinks,
      affByDay,
      contactByDay,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
