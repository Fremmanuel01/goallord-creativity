const express     = require('express');
const supabase    = require('../lib/supabase');
const blogDb      = require('../db/blog');
const affiliateDb = require('../db/affiliate');
const contactsDb  = require('../db/contacts');
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
    const sinceISO = since.toISOString();

    const [
      totalPosts,
      totalViewsResult,
      totalAffiliateClicks,
      totalContacts,
      topPostsResult,
      affClicks,
      contactsResult,
      topAffLinksResult,
    ] = await Promise.all([
      blogDb.countPosts({ published: true }),

      // Blog views aggregate via RPC
      supabase.rpc('get_total_blog_views'),

      // Total affiliate clicks
      (async () => {
        const { count, error } = await supabase.from('affiliate_clicks').select('id', { count: 'exact', head: true });
        if (error) throw error;
        return count || 0;
      })(),

      contactsDb.count(),

      // Top 10 posts by views
      blogDb.findPosts({ filter: { published: true }, sort: '-views', page: 1, limit: 10, excludeContent: true }),

      // Affiliate clicks last 30 days
      (async () => {
        const { data, error } = await supabase.from('affiliate_clicks').select('created_at').gte('created_at', sinceISO);
        if (error) throw error;
        return data || [];
      })(),

      // Contact signups last 30 days
      (async () => {
        const { data, error } = await supabase.from('contacts').select('created_at').gte('created_at', sinceISO);
        if (error) throw error;
        return data || [];
      })(),

      // Top 5 affiliate links
      (async () => {
        const { data, error } = await supabase.from('affiliate_links').select('slug, name, total_clicks, category').order('total_clicks', { ascending: false }).limit(5);
        if (error) throw error;
        return data || [];
      })(),
    ]);

    const totalViews = totalViewsResult.data ?? 0;
    const topPosts = topPostsResult.data;

    // Build day-by-day affiliate click trend
    const affByDay = buildDayMap(since);
    affClicks.forEach(c => {
      const day = new Date(c.created_at).toISOString().split('T')[0];
      if (day in affByDay) affByDay[day]++;
    });

    // Build day-by-day contact trend
    const contactByDay = buildDayMap(since);
    contactsResult.forEach(c => {
      const day = new Date(c.created_at).toISOString().split('T')[0];
      if (day in contactByDay) contactByDay[day]++;
    });

    res.json({
      totals: {
        posts:           totalPosts,
        views:           totalViews,
        affiliateClicks: totalAffiliateClicks,
        contacts:        totalContacts,
      },
      topPosts:    topPosts,
      topAffLinks: topAffLinksResult,
      affByDay,
      contactByDay,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
