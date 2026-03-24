const express       = require('express');
const AffiliateLink = require('../models/AffiliateLink');
const AffiliateClick = require('../models/AffiliateClick');

const router = express.Router();

router.get('/:slug', async (req, res) => {
  try {
    const link = await AffiliateLink.findOne({ slug: req.params.slug.toLowerCase(), active: true });
    if (!link) return res.status(404).send('Link not found');

    // Detect device from User-Agent
    const ua = req.headers['user-agent'] || '';
    let device = 'desktop';
    if (/tablet|ipad/i.test(ua))  device = 'tablet';
    else if (/mobile/i.test(ua))  device = 'mobile';

    // Extract post slug from Referer URL
    let postSlug = '';
    const referer = req.headers.referer || req.headers.referrer || '';
    const match   = referer.match(/[?&]slug=([^&]+)/);
    if (match) postSlug = decodeURIComponent(match[1]);

    // Country from Cloudflare header (if behind CF) or x-country
    const country = req.headers['cf-ipcountry'] || req.headers['x-country'] || '';

    // Log click + increment counter (non-blocking)
    AffiliateClick.create({ linkSlug: link.slug, postSlug, device, country }).catch(() => {});
    AffiliateLink.updateOne({ _id: link._id }, { $inc: { totalClicks: 1 } }).catch(() => {});

    // Append UTM parameters to destination URL
    let dest = link.destination;
    try {
      const url = new URL(dest);
      if (!url.searchParams.has('utm_source'))   url.searchParams.set('utm_source',   'goallordcreativity');
      if (!url.searchParams.has('utm_medium'))   url.searchParams.set('utm_medium',   'blog');
      if (!url.searchParams.has('utm_campaign')) url.searchParams.set('utm_campaign', postSlug || link.slug);
      if (!url.searchParams.has('utm_content'))  url.searchParams.set('utm_content',  link.slug);
      dest = url.toString();
    } catch (e) { /* use original if URL invalid */ }

    res.redirect(302, dest);
  } catch (err) {
    console.error('Affiliate redirect error:', err.message);
    res.status(500).send('Error');
  }
});

module.exports = router;
