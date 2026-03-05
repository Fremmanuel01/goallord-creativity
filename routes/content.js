const express = require('express');
const Content = require('../models/Content');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/content/:section — public
router.get('/:section', async (req, res) => {
  try {
    const doc = await Content.findOne({ section: req.params.section });
    if (!doc) return res.status(404).json({ error: 'Section not found' });
    res.json({ section: doc.section, data: doc.data, updatedAt: doc.updatedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/content — list all sections (protected)
router.get('/', requireAuth, async (req, res) => {
  try {
    const docs = await Content.find({}, 'section updatedAt');
    res.json({ data: docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/content/:section — protected (upsert)
router.put('/:section', requireAuth, async (req, res) => {
  try {
    const doc = await Content.findOneAndUpdate(
      { section: req.params.section },
      { data: req.body.data, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    res.json({ section: doc.section, data: doc.data, updatedAt: doc.updatedAt });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Seed default content sections
async function seedContent() {
  const sections = [
    {
      section: 'hero',
      data: {
        headline: 'We Build Brands That Get Noticed.',
        subline: 'Websites, visuals, and digital strategies for bold Nigerian businesses.',
        cta1: { text: 'Start a Project', url: 'contact.html' },
        cta2: { text: 'View Portfolio', url: 'portfolio.html' }
      }
    },
    {
      section: 'portfolio',
      data: {
        items: [
          { id: 1, title: 'FoodCart Nigeria', category: 'E-commerce', image: '', description: 'Full e-commerce platform for food delivery', url: '#' },
          { id: 2, title: 'MedHub Clinic',    category: 'Web App',    image: '', description: 'Patient management & appointment booking', url: '#' },
          { id: 3, title: 'StyleHouse Lagos', category: 'E-commerce', image: '', description: 'Fashion brand with online store',          url: '#' },
          { id: 4, title: 'Apex Consulting',  category: 'Website',    image: '', description: 'Corporate website & brand identity',       url: '#' },
          { id: 5, title: 'SwiftPay Finance', category: 'Web App',    image: '', description: 'Fintech dashboard & landing page',         url: '#' },
          { id: 6, title: 'Greenleaf Farms',  category: 'WordPress',  image: '', description: 'Agricultural business website',            url: '#' },
        ]
      }
    },
    {
      section: 'blog',
      data: {
        posts: [
          { id: 1, title: '5 Web Design Trends Dominating 2026', category: 'Design',          date: 'Feb 20 2026', excerpt: 'From glassmorphism to AI-generated layouts — here is what is hot.', image: '', url: '#' },
          { id: 2, title: 'How to Rank #1 on Google in Nigeria',  category: 'Digital Marketing', date: 'Feb 15 2026', excerpt: 'Local SEO strategies that actually work for Nigerian businesses.',   image: '', url: '#' },
          { id: 3, title: 'Why Your Brand Needs a Style Guide',    category: 'Branding',         date: 'Feb 10 2026', excerpt: 'Consistency builds trust — and trust builds revenue.',             image: '', url: '#' },
        ]
      }
    },
    {
      section: 'testimonials',
      data: {
        items: [
          { id: 1, name: 'Chukwuemeka Obi',   role: 'CEO, FoodCart Nigeria',  text: 'Goallord transformed our online presence completely. Sales increased by 40% in the first month.' },
          { id: 2, name: 'Fatima Yusuf',       role: 'Founder, StyleHouse',    text: 'Professional, creative, and always on time. Best web team in Onitsha hands down.' },
          { id: 3, name: 'Dr. Adaeze Nwosu',  role: 'Director, MedHub Clinic', text: 'Our patient portal has never been smoother. The team understood exactly what we needed.' },
        ]
      }
    }
  ];

  for (const s of sections) {
    const exists = await Content.findOne({ section: s.section });
    if (!exists) await Content.create(s);
  }
  console.log('Content seeded');
}

module.exports = router;
module.exports.seedContent = seedContent;
