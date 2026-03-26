const express  = require('express');
const BlogPost  = require('../models/BlogPost');
const BlogComment = require('../models/BlogComment');
const { requireAuth } = require('../middleware/auth');
const xss = require('xss');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const commentLimiter = rateLimit({ windowMs: 60*60*1000, max: 10, message: { error: 'Too many comments. Try again later.' } });
const reactLimiter = rateLimit({ windowMs: 60*1000, max: 20, message: { error: 'Slow down.' } });

// ── GET /api/blog  — list published posts ──────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const limit   = Math.min(parseInt(req.query.limit)  || 20, 50);
    const page    = Math.max(parseInt(req.query.page)   || 1,  1);
    const exclude = req.query.exclude || null;
    const filter  = { published: true };
    if (exclude) filter.slug = { $ne: exclude };

    const total = await BlogPost.countDocuments(filter);
    const posts = await BlogPost.find(filter, '-content')
      .sort({ publishedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const featured = await BlogPost.findOne({ published: true, featured: true }, '-content').sort({ publishedAt: -1 });

    res.json({ posts, featured, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/blog/comments/all — admin: all comments ──────────────────────
router.get('/comments/all', requireAuth, async (req, res) => {
  try {
    const comments = await BlogComment.find()
        .populate('post', 'title slug')
        .sort({ createdAt: -1 })
        .limit(parseInt(req.query.limit) || 100);
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/blog/comments/:id — admin: delete comment ─────────────────
router.delete('/comments/:id', requireAuth, async (req, res) => {
  try {
    const comment = await BlogComment.findByIdAndDelete(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/blog/:slug ────────────────────────────────────────────────────
router.get('/:slug', async (req, res) => {
  try {
    const post = await BlogPost.findOne({ slug: req.params.slug, published: true });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Non-blocking view increment
    BlogPost.updateOne({ _id: post._id }, { $inc: { views: 1 } }).catch(() => {});

    const fields = 'slug title publishedAt coverImage category readTime';
    const [prev, next] = await Promise.all([
      BlogPost.findOne({ published: true, publishedAt: { $gt: post.publishedAt } })
        .sort({ publishedAt: 1 }).select(fields),
      BlogPost.findOne({ published: true, publishedAt: { $lt: post.publishedAt } })
        .sort({ publishedAt: -1 }).select(fields),
    ]);

    res.json({ ...post.toObject(), _prev: prev || null, _next: next || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/blog  — create (admin) ──────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, slug, excerpt, content, coverImage, category, tags, author, authorAvatar, readTime, featured, published, hasAffiliate, affiliateCta } = req.body;
    const post = await BlogPost.create({ title, slug, excerpt, content, coverImage, category, tags, author, authorAvatar, readTime, featured, published, hasAffiliate, affiliateCta });
    res.status(201).json(post);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── PUT /api/blog/:slug  — update (admin) ─────────────────────────────────
router.put('/:slug', requireAuth, async (req, res) => {
  try {
    const { title, slug, excerpt, content, coverImage, category, tags, author, authorAvatar, readTime, featured, published, publishedAt, hasAffiliate, affiliateCta } = req.body;
    const allowed = { title, slug, excerpt, content, coverImage, category, tags, author, authorAvatar, readTime, featured, published, publishedAt, hasAffiliate, affiliateCta };
    Object.keys(allowed).forEach(k => allowed[k] === undefined && delete allowed[k]);
    const post = await BlogPost.findOneAndUpdate({ slug: req.params.slug }, allowed, { new: true });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/blog/:slug/comments — public: approved comments ──────────────
router.get('/:slug/comments', async (req, res) => {
  try {
    const post = await BlogPost.findOne({ slug: req.params.slug });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const comments = await BlogComment.find({ post: post._id, approved: true }).sort({ createdAt: -1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/blog/:slug/comments — post a comment ───────────────────────
router.post('/:slug/comments', commentLimiter, async (req, res) => {
  try {
    const { name, email, content } = req.body;
    if (!name || !email || !content) return res.status(400).json({ error: 'Name, email, and comment are required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email.' });
    if (content.length > 2000) return res.status(400).json({ error: 'Comment too long (max 2000 characters).' });

    const post = await BlogPost.findOne({ slug: req.params.slug });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const crypto = require('crypto');
    const token = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);

    const comment = await BlogComment.create({
        post: post._id,
        name: xss(name.trim()),
        email: email.toLowerCase().trim(),
        content: xss(content.trim()),
        token
    });
    res.status(201).json(comment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/blog/:slug/react — emoji reaction ──────────────────────────
router.post('/:slug/react', reactLimiter, async (req, res) => {
  try {
    const { emoji } = req.body;
    const valid = ['like', 'love', 'fire', 'clap', 'think'];
    if (!valid.includes(emoji)) return res.status(400).json({ error: 'Invalid reaction.' });

    const post = await BlogPost.findOneAndUpdate(
        { slug: req.params.slug },
        { $inc: { ['reactions.' + emoji]: 1 } },
        { new: true }
    );
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post.reactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/blog/:slug  — delete (admin) ──────────────────────────────
router.delete('/:slug', requireAuth, async (req, res) => {
  try {
    const post = await BlogPost.findOneAndDelete({ slug: req.params.slug });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SEED ───────────────────────────────────────────────────────────────────
async function seedBlogPosts() {
  const count = await BlogPost.countDocuments();
  if (count > 0) return;

  await BlogPost.insertMany([

    // ── POST 1 ────────────────────────────────────────────────────────────
    {
      slug:        'nigeria-web-landscape-2026',
      title:       "Nigeria's Web Landscape in 2026: What Every Business Owner Needs to Know",
      excerpt:     'Over 220 million people. A growing middle class. And fewer than 30% of SMEs with a functional website. The opportunity is enormous — but so is the risk of getting it wrong.',
      category:    'Business',
      tags:        ['Nigeria', 'Web Design', 'SEO', 'Business'],
      readTime:    '8 min read',
      featured:    true,
      coverImage:  'assets/images/portfolio/img-1.jpg',
      publishedAt: new Date('2026-03-01'),
      content: `
<p class="text-white-64 mb-4" style="font-size: 1.15rem; line-height: 1.8;">
  Over 220 million people. A fast-growing middle class. Smartphone penetration crossing 50%. And yet, fewer than 30% of Nigerian SMEs have a functional website in 2026. The opportunity is enormous — but so is the risk of getting it wrong.
</p>
<p class="text-white-64 mb-5">
  At Goallord Creativity Limited, we work with Nigerian businesses every day. We see what separates brands that win online from those that remain invisible. This article breaks down the current state of Nigeria's web landscape and what it means for your business — practically.
</p>
<div class="br-line mb-5"></div>
<h2 class="letter-space--2 mb-4">The Numbers First</h2>
<p class="text-white-64 mb-4">
  Nigeria has approximately 122 million internet users as of early 2026 — that's over half the population online. Mobile accounts for more than 80% of that traffic. Data from Google's Year in Search and local market surveys consistently show that Nigerians are searching for products, services, healthcare providers, schools, and professionals online at record rates.
</p>
<p class="text-white-64 mb-5">The search happens. The question is: can they find you?</p>
<div class="gl-pullquote mb-5">
  <p class="h4 letter-space--2 mb-2">"The search happens every day. Millions of Nigerians looking for products, services, professionals. The question is whether your business shows up when they look."</p>
  <p class="text-caption text-primary letter-space--1 mb-0">— GOALLORD CREATIVITY TEAM</p>
</div>
<h2 class="letter-space--2 mb-4">Why Most Nigerian SMEs Still Don't Have Websites</h2>
<p class="text-white-64 mb-3">We asked this question across dozens of client discovery calls in 2025. The answers fell into three buckets:</p>
<ol class="text-white-64 mb-5" style="padding-left: 1.5rem; line-height: 2;">
  <li class="mb-2"><strong class="text-white">Cost perception.</strong> Many business owners believe a professional website costs ₦2–5 million. It doesn't. A solid WordPress business site starts from ₦500,000 — and the return on investment begins immediately.</li>
  <li class="mb-2"><strong class="text-white">The "WhatsApp is enough" trap.</strong> WhatsApp Business is powerful for customer management, but it doesn't make you discoverable. A new customer who doesn't already know you cannot find you on WhatsApp.</li>
  <li><strong class="text-white">Bad past experience.</strong> Some owners paid someone who delivered a poorly built site that never ranked, never worked on mobile, and then became inaccessible when the developer went dark. That experience kills confidence.</li>
</ol>
<h2 class="letter-space--2 mb-4">What Google Now Expects from Nigerian Business Websites</h2>
<p class="text-white-64 mb-4">Google's ranking algorithm has evolved significantly. The signals that matter most in 2026:</p>
<div class="mb-5">
  <div class="d-flex gap-3 mb-4"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">01</span><div><strong class="text-white d-block mb-1">Core Web Vitals</strong><p class="text-white-64 mb-0">Largest Contentful Paint under 2.5s, Cumulative Layout Shift under 0.1. Google uses these directly in ranking.</p></div></div>
  <div class="d-flex gap-3 mb-4"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">02</span><div><strong class="text-white d-block mb-1">Mobile-first design</strong><p class="text-white-64 mb-0">Google indexes the mobile version of your site first. If it looks broken on a ₦60,000 Android phone, you're losing rankings and customers simultaneously.</p></div></div>
  <div class="d-flex gap-3 mb-4"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">03</span><div><strong class="text-white d-block mb-1">E-E-A-T signals</strong><p class="text-white-64 mb-0">Real team pages, verifiable contact info, client testimonials, and local business schema all contribute to Google trusting — and ranking — your site.</p></div></div>
  <div class="d-flex gap-3 mb-4"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">04</span><div><strong class="text-white d-block mb-1">HTTPS + security</strong><p class="text-white-64 mb-0">An insecure site is flagged as "Not Secure" in Chrome. In Nigeria, where trust in online transactions is still being built, a security warning can kill a conversion instantly.</p></div></div>
  <div class="d-flex gap-3"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">05</span><div><strong class="text-white d-block mb-1">Local SEO schema</strong><p class="text-white-64 mb-0">Structured data telling Google your business name, address, phone, and hours. Combined with Google Business Profile, this is what puts you in local map packs.</p></div></div>
</div>
<h2 class="letter-space--2 mb-4">The Three Types of Website a Nigerian Business Actually Needs</h2>
<div class="mb-3" style="background:var(--gl-card);border:1px solid var(--gl-border);border-radius:8px;padding:24px 28px;"><p class="text-primary text-caption fw-medium letter-space--1 mb-2">01 — THE CREDIBILITY SITE</p><p class="text-white-64 mb-0">If your business makes money through phone calls, WhatsApp, or in-person visits — you need a 5–7 page WordPress site that ranks locally, loads fast, and makes it easy to call or message. Budget: ₦500k–₦1.5M.</p></div>
<div class="mb-3" style="background:var(--gl-card);border:1px solid var(--gl-border);border-radius:8px;padding:24px 28px;"><p class="text-primary text-caption fw-medium letter-space--1 mb-2">02 — THE COMMERCE SITE</p><p class="text-white-64 mb-0">If you sell physical or digital products, you need an e-commerce store with Paystack or Flutterwave integrated, inventory management, and logistics partner APIs. Budget: ₦1.5M–₦4M.</p></div>
<div class="mb-5" style="background:var(--gl-card);border:1px solid var(--gl-border);border-radius:8px;padding:24px 28px;"><p class="text-primary text-caption fw-medium letter-space--1 mb-2">03 — THE PLATFORM / WEB APP</p><p class="text-white-64 mb-0">If your business model depends on users logging in, booking, paying, or tracking — you need a custom web application. Build the core workflow, validate it with real users, then scale. Budget: ₦3M–₦10M+.</p></div>
<h2 class="letter-space--2 mb-4">The Bottom Line</h2>
<p class="text-white-64 mb-4">Nigeria's digital economy is not a future trend — it's the current reality. Every day without a functional, search-optimised web presence is a day your competitors are capturing the customers who were looking for exactly what you offer.</p>
<p class="text-white-64 mb-5">At Goallord, we've helped 50+ businesses across Nigeria get this right. If you want a direct conversation about what your specific business needs, reach out — no sales pitch, just an honest assessment.</p>
<div class="br-line mb-5"></div>
<div style="background:var(--gl-card);border:1px solid var(--gl-border);border-radius:8px;padding:36px 32px;" class="mb-5">
  <div class="row align-items-center">
    <div class="col-lg-8"><h4 class="letter-space--2 mb-2">Ready to talk about your website?</h4><p class="text-white-64 mb-0">Tell us what you need and we'll get back within 24 hours.</p></div>
    <div class="col-lg-4 mt-3 mt-lg-0 text-lg-end"><a href="contact.html" class="tf-btn style-fill"><span class="text-caption fw-medium">START A PROJECT</span></a></div>
  </div>
</div>`
    },

    // ── POST 2 ────────────────────────────────────────────────────────────
    {
      slug:        'wordpress-vs-custom-website-nigeria',
      title:       'WordPress vs Custom Website: Which Should Your Business Choose in 2026?',
      excerpt:     'The debate never ends — but the answer is simpler than you think. Here\'s how to decide based on your business goals, not buzzwords.',
      category:    'WordPress',
      tags:        ['WordPress', 'Web Design', 'Business', 'Nigeria'],
      readTime:    '6 min read',
      coverImage:  'assets/images/portfolio/img-2.jpg',
      publishedAt: new Date('2026-02-10'),
      content: `
<p class="text-white-64 mb-4" style="font-size: 1.15rem; line-height: 1.8;">
  We get this question on almost every discovery call. "Should I go WordPress or custom?" The honest answer: it depends entirely on what your business actually needs — not what sounds more impressive.
</p>
<p class="text-white-64 mb-5">Here's our practical framework for making the right call.</p>
<div class="br-line mb-5"></div>
<h2 class="letter-space--2 mb-4">What WordPress Actually Is</h2>
<p class="text-white-64 mb-4">WordPress powers 43% of all websites on the internet. It's not a compromise — it's a professional platform used by Fortune 500 companies, major news organisations, and thousands of Nigerian businesses doing serious revenue online.</p>
<p class="text-white-64 mb-5">When we say "WordPress site," we mean a fully custom-designed website built on WordPress as the foundation. You get a unique design, professional functionality, and the ability to update your own content — without needing a developer for every change.</p>
<div class="gl-pullquote mb-5">
  <p class="h4 letter-space--2 mb-2">"WordPress is not a limitation. In the hands of the right agency, it's a professional platform that delivers exceptional results at a fraction of the cost of going fully custom."</p>
  <p class="text-caption text-primary letter-space--1 mb-0">— GOALLORD CREATIVITY TEAM</p>
</div>
<h2 class="letter-space--2 mb-4">When WordPress Is the Right Choice</h2>
<ul class="text-white-64 mb-5" style="padding-left: 1.5rem; line-height: 2.2;">
  <li class="mb-2"><strong class="text-white">You need a credibility and lead-generation site.</strong> Business website, portfolio, services pages, contact forms — WordPress handles all of this beautifully.</li>
  <li class="mb-2"><strong class="text-white">You want to manage your own content.</strong> The WordPress editor lets you update pages, publish blog posts, and add images without touching code.</li>
  <li class="mb-2"><strong class="text-white">You need e-commerce with standard flows.</strong> WooCommerce on WordPress handles product listings, Paystack/Flutterwave payments, order management, and inventory — all out of the box.</li>
  <li class="mb-2"><strong class="text-white">Your budget is under ₦1.5M.</strong> A premium WordPress site can be built, designed, and launched at a fraction of the cost of a fully custom codebase.</li>
  <li><strong class="text-white">You need it live in 4–8 weeks.</strong> Established workflows mean faster delivery without sacrificing quality.</li>
</ul>
<h2 class="letter-space--2 mb-4">When Custom Development Is the Right Choice</h2>
<ul class="text-white-64 mb-5" style="padding-left: 1.5rem; line-height: 2.2;">
  <li class="mb-2"><strong class="text-white">You need users to log in and do things.</strong> Bookings, dashboards, patient portals, fintech platforms, SaaS tools — WordPress wasn't built for this.</li>
  <li class="mb-2"><strong class="text-white">You have complex business logic.</strong> Custom algorithms, real-time data, API integrations with proprietary systems — these need custom code.</li>
  <li class="mb-2"><strong class="text-white">You're building a product, not a website.</strong> If the software IS the business (not just a marketing tool for the business), go custom.</li>
  <li><strong class="text-white">You have the budget and timeline.</strong> Custom development is more expensive (₦3M–₦10M+) and takes longer (3–6+ months). This is the right investment when the use case demands it.</li>
</ul>
<h2 class="letter-space--2 mb-4">The Cost Reality</h2>
<div class="mb-3" style="background:var(--gl-card);border:1px solid var(--gl-border);border-radius:8px;padding:24px 28px;"><p class="text-primary text-caption fw-medium letter-space--1 mb-2">WORDPRESS</p><p class="text-white-64 mb-0">Business site: ₦500k–₦1.5M. E-commerce: ₦1M–₦2.5M. Timeline: 3–8 weeks. Ongoing maintenance: ₦50k–₦150k/month.</p></div>
<div class="mb-5" style="background:var(--gl-card);border:1px solid var(--gl-border);border-radius:8px;padding:24px 28px;"><p class="text-primary text-caption fw-medium letter-space--1 mb-2">CUSTOM DEVELOPMENT</p><p class="text-white-64 mb-0">MVP web app: ₦3M–₦6M. Full platform: ₦6M–₦15M+. Timeline: 3–9 months. Ongoing: ₦200k–₦500k/month.</p></div>
<h2 class="letter-space--2 mb-4">Our Honest Recommendation</h2>
<p class="text-white-64 mb-4">Start with WordPress unless you genuinely need custom. Most businesses that "think" they need custom actually need a well-built WordPress site. You can always migrate to a custom platform once you've validated your market and revenue.</p>
<p class="text-white-64 mb-5">We've built both extensively. The best choice is the one that gets you live, generating leads, and growing — not the one that sounds more impressive in a pitch.</p>
<div class="br-line mb-5"></div>
<div style="background:var(--gl-card);border:1px solid var(--gl-border);border-radius:8px;padding:36px 32px;" class="mb-5">
  <div class="row align-items-center">
    <div class="col-lg-8"><h4 class="letter-space--2 mb-2">Not sure which is right for your project?</h4><p class="text-white-64 mb-0">Tell us what you're building and we'll give you an honest recommendation — free.</p></div>
    <div class="col-lg-4 mt-3 mt-lg-0 text-lg-end"><a href="contact.html" class="tf-btn style-fill"><span class="text-caption fw-medium">TALK TO US</span></a></div>
  </div>
</div>`
    },

    // ── POST 3 ────────────────────────────────────────────────────────────
    {
      slug:        'local-seo-nigerian-businesses',
      title:       'Local SEO for Nigerian Businesses: Rank on Google Without a Big Budget',
      excerpt:     'Most Nigerian businesses are invisible on Google — not because they can\'t rank, but because nobody told them what actually works. Here\'s the playbook.',
      category:    'SEO',
      tags:        ['SEO', 'Nigeria', 'Google', 'Digital Marketing'],
      readTime:    '7 min read',
      coverImage:  'assets/images/portfolio/img-3.jpg',
      publishedAt: new Date('2026-01-15'),
      content: `
<p class="text-white-64 mb-4" style="font-size: 1.15rem; line-height: 1.8;">
  When someone in Onitsha searches "plumber near me" or "web designer Anambra," Google shows three businesses in a map pack above all the organic results. Those three businesses get the majority of clicks. Here's how to become one of them — without spending a fortune.
</p>
<p class="text-white-64 mb-5">Local SEO is not complicated. But it requires consistency in the right places. Most Nigerian businesses skip these fundamentals entirely, which means even small, consistent effort puts you ahead of the competition.</p>
<div class="br-line mb-5"></div>
<h2 class="letter-space--2 mb-4">Step 1: Claim and Complete Your Google Business Profile</h2>
<p class="text-white-64 mb-4">This is non-negotiable. Google Business Profile (formerly Google My Business) is the single highest-leverage SEO action available to any local Nigerian business — and it's completely free.</p>
<ul class="text-white-64 mb-5" style="padding-left: 1.5rem; line-height: 2.2;">
  <li class="mb-2"><strong class="text-white">Complete every field.</strong> Business name, address, phone, website, hours, category, description. Google rewards completeness.</li>
  <li class="mb-2"><strong class="text-white">Add real photos.</strong> Interior, exterior, team, products. Businesses with photos get 42% more direction requests and 35% more website clicks.</li>
  <li class="mb-2"><strong class="text-white">Collect Google reviews.</strong> Ask every satisfied client. Even 10 genuine reviews puts you ahead of most Nigerian competitors who have none.</li>
  <li><strong class="text-white">Post updates regularly.</strong> Treat your profile like a social media page — new offers, events, and articles signal to Google that you're active.</li>
</ul>
<h2 class="letter-space--2 mb-4">Step 2: On-Page Signals That Matter</h2>
<p class="text-white-64 mb-4">Your website needs to tell Google exactly who you are, where you are, and what you do. This is simpler than most people think:</p>
<div class="mb-5">
  <div class="d-flex gap-3 mb-4"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">01</span><div><strong class="text-white d-block mb-1">NAP Consistency</strong><p class="text-white-64 mb-0">Your Name, Address, and Phone must be identical everywhere — your website, Google Business Profile, and every directory. Even small differences (Road vs Rd) confuse Google.</p></div></div>
  <div class="d-flex gap-3 mb-4"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">02</span><div><strong class="text-white d-block mb-1">Location-specific title tags</strong><p class="text-white-64 mb-0">Instead of "Web Design Services," use "Web Design Agency in Onitsha, Nigeria." This is how people search — match their language.</p></div></div>
  <div class="d-flex gap-3 mb-4"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">03</span><div><strong class="text-white d-block mb-1">LocalBusiness Schema</strong><p class="text-white-64 mb-0">Structured data markup that tells Google your business details in a machine-readable format. We add this to every site we build — it directly impacts your map pack eligibility.</p></div></div>
  <div class="d-flex gap-3"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">04</span><div><strong class="text-white d-block mb-1">Location page or footer</strong><p class="text-white-64 mb-0">A dedicated "Our Location" section or contact page with your full address, embedded Google Map, and nearby landmark references.</p></div></div>
</div>
<h2 class="letter-space--2 mb-4">Step 3: Build Local Authority</h2>
<p class="text-white-64 mb-4">Authority comes from other websites linking to yours. For local SEO, local links matter most:</p>
<ul class="text-white-64 mb-5" style="padding-left: 1.5rem; line-height: 2.2;">
  <li class="mb-2"><strong class="text-white">List on Nigerian directories.</strong> VConnect, BusinessList.ng, Connectnigeria.com. Free, takes 30 minutes, builds trust signals.</li>
  <li class="mb-2"><strong class="text-white">Ask clients to link to you.</strong> If you built a website for a business, ask them to add a "Website by Goallord" credit with a link.</li>
  <li class="mb-2"><strong class="text-white">Sponsor local events.</strong> Event pages often link to sponsors — these local mentions carry significant weight.</li>
  <li><strong class="text-white">Get listed on Clutch.co.</strong> The international agency directory. Even one strong review here sends powerful authority signals to Google.</li>
</ul>
<h2 class="letter-space--2 mb-4">Quick Wins You Can Do This Week</h2>
<div class="gl-pullquote mb-5">
  <p class="h4 letter-space--2 mb-2">"Most Nigerian businesses are invisible on Google not because SEO is hard, but because they've skipped the basics. The basics, done well, are enough to outrank 80% of your local competition."</p>
  <p class="text-caption text-primary letter-space--1 mb-0">— GOALLORD CREATIVITY TEAM</p>
</div>
<div class="br-line mb-5"></div>
<div style="background:var(--gl-card);border:1px solid var(--gl-border);border-radius:8px;padding:36px 32px;" class="mb-5">
  <div class="row align-items-center">
    <div class="col-lg-8"><h4 class="letter-space--2 mb-2">Want us to audit your current SEO?</h4><p class="text-white-64 mb-0">We'll review your website and Google presence and tell you exactly what to fix — no obligation.</p></div>
    <div class="col-lg-4 mt-3 mt-lg-0 text-lg-end"><a href="contact.html" class="tf-btn style-fill"><span class="text-caption fw-medium">GET A FREE AUDIT</span></a></div>
  </div>
</div>`
    },

    // ── POST 4 ────────────────────────────────────────────────────────────
    {
      slug:        'ecommerce-nigeria-2026-checklist',
      title:       'Launching an E-commerce Store in Nigeria: The Complete 2026 Checklist',
      excerpt:     'Nigeria\'s e-commerce market crossed $12 billion in 2025. Here\'s everything you need to launch a store that actually converts Nigerian customers.',
      category:    'Digital Marketing',
      tags:        ['E-commerce', 'Nigeria', 'Paystack', 'Business'],
      readTime:    '9 min read',
      coverImage:  'assets/images/portfolio/img-4.jpg',
      publishedAt: new Date('2025-11-20'),
      content: `
<p class="text-white-64 mb-4" style="font-size: 1.15rem; line-height: 1.8;">
  Nigeria's e-commerce market is one of the fastest-growing in Africa. But too many store owners launch without understanding the unique dynamics of selling to Nigerian customers online — and wonder why their conversion rate is near zero.
</p>
<p class="text-white-64 mb-5">This checklist covers everything from platform selection to payment integration to trust-building. Go through it before you launch.</p>
<div class="br-line mb-5"></div>
<h2 class="letter-space--2 mb-4">1. Choose the Right Platform</h2>
<div class="mb-3" style="background:var(--gl-card);border:1px solid var(--gl-border);border-radius:8px;padding:24px 28px;"><p class="text-primary text-caption fw-medium letter-space--1 mb-2">SHOPIFY</p><p class="text-white-64 mb-0">Best for product-focused businesses with international ambitions. Handles hosting, security, and updates automatically. Higher monthly cost but lower development time. Paystack integrates natively.</p></div>
<div class="mb-5" style="background:var(--gl-card);border:1px solid var(--gl-border);border-radius:8px;padding:24px 28px;"><p class="text-primary text-caption fw-medium letter-space--1 mb-2">WOOCOMMERCE (on WordPress)</p><p class="text-white-64 mb-0">Best for Nigerian businesses that want full control, lower ongoing costs, and local hosting. More setup required but more flexible. We recommend this for most Nigerian SMEs.</p></div>
<h2 class="letter-space--2 mb-4">2. Payment Gateway — Get This Right</h2>
<p class="text-white-64 mb-4">This is where most Nigerian e-commerce stores lose customers. Your payment experience must be seamless.</p>
<ul class="text-white-64 mb-5" style="padding-left: 1.5rem; line-height: 2.2;">
  <li class="mb-2"><strong class="text-white">Paystack or Flutterwave.</strong> Both support card payments, bank transfer, USSD, and mobile money. Paystack is easier to set up; Flutterwave has broader Pan-African coverage.</li>
  <li class="mb-2"><strong class="text-white">Offer bank transfer as a fallback.</strong> Many Nigerian customers prefer to pay via bank transfer. Make this option visible and easy.</li>
  <li class="mb-2"><strong class="text-white">Test on mobile first.</strong> Over 80% of Nigerian online shoppers use a smartphone. If your checkout is broken on mobile, your conversion rate is effectively zero.</li>
  <li><strong class="text-white">Show prices in Naira.</strong> Currency confusion kills trust. Always display NGN prominently.</li>
</ul>
<h2 class="letter-space--2 mb-4">3. Logistics & Delivery</h2>
<p class="text-white-64 mb-4">Delivery is where Nigerian e-commerce most often breaks down. Set clear expectations from the start:</p>
<ul class="text-white-64 mb-5" style="padding-left: 1.5rem; line-height: 2.2;">
  <li class="mb-2"><strong class="text-white">Partner with a courier.</strong> GIG Logistics, Kwik Delivery, Sendbox, or DHL for premium. Display delivery timeframes prominently on product pages.</li>
  <li class="mb-2"><strong class="text-white">Offer Lagos-first if you're starting out.</strong> Lagos represents a disproportionate share of Nigerian e-commerce. Nail delivery there before expanding nationwide.</li>
  <li><strong class="text-white">Send order confirmations and tracking via WhatsApp.</strong> Nigerian customers expect this. Silence after purchase = distrust.</li>
</ul>
<h2 class="letter-space--2 mb-4">4. Trust Signals</h2>
<p class="text-white-64 mb-5">Nigerian online shoppers are cautious — rightly so, given the prevalence of fraud. Your store must actively build trust:</p>
<div class="mb-5">
  <div class="d-flex gap-3 mb-3"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">✓</span><p class="text-white-64 mb-0">Display a real physical address and phone number</p></div>
  <div class="d-flex gap-3 mb-3"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">✓</span><p class="text-white-64 mb-0">Show customer reviews with photos where possible</p></div>
  <div class="d-flex gap-3 mb-3"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">✓</span><p class="text-white-64 mb-0">Clear refund and return policy (even if it's simple)</p></div>
  <div class="d-flex gap-3 mb-3"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">✓</span><p class="text-white-64 mb-0">WhatsApp chat button — Nigerians want to ask questions before buying</p></div>
  <div class="d-flex gap-3"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">✓</span><p class="text-white-64 mb-0">SSL certificate (https) — non-negotiable</p></div>
</div>
<div class="br-line mb-5"></div>
<div style="background:var(--gl-card);border:1px solid var(--gl-border);border-radius:8px;padding:36px 32px;" class="mb-5">
  <div class="row align-items-center">
    <div class="col-lg-8"><h4 class="letter-space--2 mb-2">Ready to launch your store?</h4><p class="text-white-64 mb-0">We build e-commerce stores that convert Nigerian customers — with Paystack integration, mobile-first design, and full launch support.</p></div>
    <div class="col-lg-4 mt-3 mt-lg-0 text-lg-end"><a href="contact.html" class="tf-btn style-fill"><span class="text-caption fw-medium">GET A QUOTE</span></a></div>
  </div>
</div>`
    },

    // ── POST 5 ────────────────────────────────────────────────────────────
    {
      slug:        'validate-web-app-idea-nigeria',
      title:       'How to Validate Your Web App Idea Before Spending a Single Naira',
      excerpt:     'The ₦10M mistake is real. Founders build entire platforms before confirming anyone wants them. Here\'s a smarter path.',
      category:    'Business',
      tags:        ['Web App', 'Startups', 'Nigeria', 'Business'],
      readTime:    '6 min read',
      coverImage:  'assets/images/portfolio/img-5.jpg',
      publishedAt: new Date('2025-10-08'),
      content: `
<p class="text-white-64 mb-4" style="font-size: 1.15rem; line-height: 1.8;">
  We've seen it happen more times than we can count. A founder comes to us with a detailed spec document for a platform that will "disrupt" an industry. They've spent months on the idea. They have investor decks. They have a brand name. And they have never spoken to a single potential user.
</p>
<p class="text-white-64 mb-5">Six months and ₦8 million later, they're back — the platform is built, but nobody is using it. Validation is not optional. It's the difference between building a business and funding an expensive lesson.</p>
<div class="br-line mb-5"></div>
<h2 class="letter-space--2 mb-4">Step 1: Define the Problem, Not the Solution</h2>
<p class="text-white-64 mb-4">Before you think about features, you must be able to answer this question in one sentence: <em class="text-white">"[Target customer] struggles with [specific problem] when [context]."</em></p>
<p class="text-white-64 mb-5">If you can't answer this without mentioning your app, you don't have a validated problem yet. Go talk to 20 potential users. Not friends. Not family. Real people who would theoretically pay for a solution to this problem.</p>
<h2 class="letter-space--2 mb-4">Step 2: The Fake Door Test</h2>
<p class="text-white-64 mb-4">Before building anything, create a simple landing page describing the product. Include a "Sign Up" or "Join the Waitlist" button. Drive traffic to it via WhatsApp, Instagram, or a simple Google Ad campaign.</p>
<div class="gl-pullquote mb-5">
  <p class="h4 letter-space--2 mb-2">"If you can't get 100 people interested enough to leave their email address, you are not ready to build. If you can, you have the beginning of a business."</p>
  <p class="text-caption text-primary letter-space--1 mb-0">— GOALLORD CREATIVITY TEAM</p>
</div>
<p class="text-white-64 mb-5">A landing page costs ₦0 to build (we can help you make one in 2 days). It answers the most important question in business: do people want this?</p>
<h2 class="letter-space--2 mb-4">Step 3: Manual Before Automated</h2>
<p class="text-white-64 mb-4">Before building an automated platform, do the thing manually. If you're building a marketplace, make the first 10 matches by hand. If you're building a booking system, take bookings via WhatsApp and a Google Form. This gives you:</p>
<ul class="text-white-64 mb-5" style="padding-left: 1.5rem; line-height: 2.2;">
  <li class="mb-2">Real user feedback on the actual process (not the interface)</li>
  <li class="mb-2">Paying customers before a single line of code</li>
  <li class="mb-2">Clear insight into which parts actually need to be automated</li>
  <li>The ability to pivot quickly when (not if) your initial assumptions are wrong</li>
</ul>
<h2 class="letter-space--2 mb-4">When to Build</h2>
<p class="text-white-64 mb-4">You're ready to build when you have:</p>
<div class="mb-5">
  <div class="d-flex gap-3 mb-3"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">✓</span><p class="text-white-64 mb-0">At least 50 people who've expressed genuine interest (not just "sounds cool")</p></div>
  <div class="d-flex gap-3 mb-3"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">✓</span><p class="text-white-64 mb-0">At least 5 people who've paid you something — even a deposit — before the product exists</p></div>
  <div class="d-flex gap-3 mb-3"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">✓</span><p class="text-white-64 mb-0">A clear understanding of the 3–5 core features that matter (nothing else)</p></div>
  <div class="d-flex gap-3"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">✓</span><p class="text-white-64 mb-0">A budget that allows for at least two full iteration cycles after launch</p></div>
</div>
<div class="br-line mb-5"></div>
<div style="background:var(--gl-card);border:1px solid var(--gl-border);border-radius:8px;padding:36px 32px;" class="mb-5">
  <div class="row align-items-center">
    <div class="col-lg-8"><h4 class="letter-space--2 mb-2">Ready to build your MVP?</h4><p class="text-white-64 mb-0">We help Nigerian founders build lean, validated web applications — from idea to launched product.</p></div>
    <div class="col-lg-4 mt-3 mt-lg-0 text-lg-end"><a href="contact.html" class="tf-btn style-fill"><span class="text-caption fw-medium">LET'S TALK</span></a></div>
  </div>
</div>`
    },

    // ── POST 6 ────────────────────────────────────────────────────────────
    {
      slug:        'web-design-career-nigeria',
      title:       'Starting a Web Design Career in Nigeria: What No One Tells You',
      excerpt:     'The demand is real, the money is real — but so are the mistakes most beginners make. An honest guide from people who\'ve trained 200+ designers in Onitsha.',
      category:    'Web Design',
      tags:        ['Web Design', 'Career', 'Nigeria', 'Academy'],
      readTime:    '4 min read',
      coverImage:  'assets/images/portfolio/img-6.jpg',
      publishedAt: new Date('2025-09-05'),
      content: `
<p class="text-white-64 mb-4" style="font-size: 1.15rem; line-height: 1.8;">
  The web design industry in Nigeria is growing faster than it can find trained talent. Businesses are desperate for designers who can deliver professional results. Freelance rates are rising. Agency salaries are competitive. The opportunity is real.
</p>
<p class="text-white-64 mb-5">But most beginners waste their first 6–12 months learning the wrong things in the wrong order. Here's what actually works — based on training 200+ students at the Goallord Academy in Onitsha.</p>
<div class="br-line mb-5"></div>
<h2 class="letter-space--2 mb-4">What to Learn First (In This Order)</h2>
<div class="mb-5">
  <div class="d-flex gap-3 mb-4"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">01</span><div><strong class="text-white d-block mb-1">Design principles before software</strong><p class="text-white-64 mb-0">Typography, colour theory, layout, whitespace. These principles apply regardless of tool. A designer who understands principles is 10x more valuable than one who only knows Figma shortcuts.</p></div></div>
  <div class="d-flex gap-3 mb-4"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">02</span><div><strong class="text-white d-block mb-1">Figma for design, HTML/CSS for implementation</strong><p class="text-white-64 mb-0">Design in Figma, build in code. You don't need to be a JavaScript developer — but understanding HTML and CSS means you can build what you design, not just hand over files.</p></div></div>
  <div class="d-flex gap-3 mb-4"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">03</span><div><strong class="text-white d-block mb-1">WordPress proficiency</strong><p class="text-white-64 mb-0">85% of your paying clients in Nigeria will want a WordPress site. Learn it properly — themes, Elementor/Bricks, WooCommerce, speed optimisation, and SEO basics.</p></div></div>
  <div class="d-flex gap-3"><span class="text-primary fw-bold flex-shrink-0" style="margin-top:2px">04</span><div><strong class="text-white d-block mb-1">Business and communication skills</strong><p class="text-white-64 mb-0">How to write proposals. How to price your work. How to handle revisions. How to communicate with clients who don't understand tech. This is what separates designers who thrive from those who struggle.</p></div></div>
</div>
<h2 class="letter-space--2 mb-4">Building Your First Portfolio</h2>
<p class="text-white-64 mb-4">No client experience yet? That's fine — here's how to build a portfolio anyway:</p>
<ul class="text-white-64 mb-5" style="padding-left: 1.5rem; line-height: 2.2;">
  <li class="mb-2"><strong class="text-white">Redesign existing Nigerian business websites.</strong> Pick 3 local businesses with poor websites and redesign them as concept projects. This shows real-world thinking.</li>
  <li class="mb-2"><strong class="text-white">Offer 1–2 free or heavily discounted projects.</strong> For real businesses, in exchange for a testimonial and portfolio rights. Don't do more than 2 free projects — ever.</li>
  <li><strong class="text-white">Document your process.</strong> Show your design decisions, not just the final result. Clients hire designers they trust. Process documentation builds trust.</li>
</ul>
<div class="gl-pullquote mb-5">
  <p class="h4 letter-space--2 mb-2">"Your first ₦100,000 client is harder to find than your second and third. Focus everything on landing that first client, delivering exceptional work, and asking for a referral."</p>
  <p class="text-caption text-primary letter-space--1 mb-0">— GOALLORD CREATIVITY TEAM</p>
</div>
<h2 class="letter-space--2 mb-4">Getting Your First Paying Client</h2>
<p class="text-white-64 mb-4">The fastest path to your first client is your existing network. Tell everyone you know that you build websites. Post your work on Instagram and LinkedIn. Join Nigerian tech communities (Twitter, Telegram groups).</p>
<p class="text-white-64 mb-5">Don't wait until your portfolio is "perfect." It will never be perfect. Launch with what you have, improve as you go, and let real client projects teach you more than any course can.</p>
<div class="br-line mb-5"></div>
<div style="background:var(--gl-card);border:1px solid var(--gl-border);border-radius:8px;padding:36px 32px;" class="mb-5">
  <div class="row align-items-center">
    <div class="col-lg-8"><h4 class="letter-space--2 mb-2">Train with the Goallord Academy</h4><p class="text-white-64 mb-0">Our web design and development programme has launched 200+ careers. Based in Onitsha, with remote options available.</p></div>
    <div class="col-lg-4 mt-3 mt-lg-0 text-lg-end"><a href="academy.html" class="tf-btn style-fill"><span class="text-caption fw-medium">VIEW PROGRAMME</span></a></div>
  </div>
</div>`
    },

  ]);

  console.log('Blog posts seeded');
}

module.exports = router;
module.exports.seedBlogPosts = seedBlogPosts;
