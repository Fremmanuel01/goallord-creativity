const express = require('express');
const contentDb = require('../db/content');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/content/:section — public
router.get('/:section', async (req, res) => {
  try {
    const doc = await contentDb.findBySection(req.params.section);
    if (!doc) return res.status(404).json({ error: 'Section not found' });
    res.json({ section: doc.section, data: doc.data, updatedAt: doc.updated_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/content — list all sections (protected)
router.get('/', requireAuth, async (req, res) => {
  try {
    const docs = await contentDb.findAll();
    res.json({ data: docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/content/:section — protected (upsert)
router.put('/:section', requireAuth, async (req, res) => {
  try {
    const doc = await contentDb.upsert(req.params.section, req.body.data);
    res.json({ section: doc.section, data: doc.data, updatedAt: doc.updated_at });
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
        headline: 'We Build High-Performing Websites That Turn Visitors Into Clients.',
        subline: 'We build premium websites, web apps, and digital strategies for businesses that refuse to be ordinary. From Onitsha to the world \u2014 bold ideas, flawless execution.',
        cta1: { text: 'Start Your Project', url: '#contactScroll' },
        cta2: { text: 'View Portfolio', url: '#workScroll' }
      }
    },
    {
      section: 'portfolio',
      data: {
        items: [
          { id: 1, title: 'TechBridge Platform',  category: 'Web App',      image: 'assets/images/section/work-1.jpg', description: 'Fintech platform connecting investors with SMEs across South-East Nigeria.', url: '#' },
          { id: 2, title: 'AgroMart Nigeria',      category: 'E-commerce',   image: 'assets/images/section/work-2.jpg', description: 'Online marketplace for agricultural products. 40% sales increase in month 1.', url: '#' },
          { id: 3, title: 'MedConnect Portal',     category: 'Web App',      image: 'assets/images/section/work-3.jpg', description: 'Patient booking and medical records system for a private hospital in Onitsha.', url: '#' },
          { id: 4, title: 'Starlight Academy',     category: 'WordPress',    image: 'assets/images/section/work-4.jpg', description: 'School website with online enrollment, fee portal, and parent dashboard.', url: '#' },
          { id: 5, title: 'QuickFix Auto',         category: 'WordPress, SEO', image: 'assets/images/section/work-5.jpg', description: 'Auto service website that jumped from page 5 to page 1 on Google for Abuja keywords.', url: '#' },
          { id: 6, title: 'StyleHaus Lagos',       category: 'E-commerce',   image: 'assets/images/section/work-6.jpg', description: 'Fashion e-commerce store with Instagram integration and local payment gateway.', url: '#' },
          { id: 7, title: 'GreenBuild Homes',      category: 'Custom Design', image: 'assets/images/section/work-1.jpg', description: 'Premium real estate website with property listings, 3D gallery, and contact CRM.', url: '#' },
          { id: 8, title: 'ChurchOnline NG',       category: 'WordPress',    image: 'assets/images/section/work-2.jpg', description: 'Multi-site church platform with livestream integration and member portal.', url: '#' },
          { id: 9, title: 'Chime Medical Centre',  category: 'Web App',      image: 'assets/images/section/work-3.jpg', description: 'Healthcare booking system and patient portal. Serving 300+ patients monthly.', url: '#' },
        ]
      }
    },
    {
      section: 'blog',
      data: {
        featured: {
          title: "Nigeria's Web Landscape in 2026: What Every Business Owner Needs to Know",
          category: 'Business', date: 'March 2026', readTime: '8 min read',
          excerpt: 'Over 220 million people. A growing middle class. And fewer than 30% of SMEs with a functional website. The opportunity is enormous \u2014 but so is the risk of getting it wrong.',
          image: 'assets/images/portfolio/img-1.jpg', url: 'blog-single.html'
        },
        posts: [
          { id: 1, title: 'WordPress vs Custom Website: Which Should Your Business Choose in 2026?', category: 'WordPress', date: 'Feb 2026', readTime: '6 min', image: 'assets/images/portfolio/img-2.jpg', url: 'blog-single.html' },
          { id: 2, title: 'Local SEO for Nigerian Businesses: Rank on Google Without a Big Budget',  category: 'SEO',       date: 'Jan 2026', readTime: '7 min', image: 'assets/images/portfolio/img-3.jpg', url: 'blog-single.html' },
          { id: 3, title: '5 Signs Your Website Is Costing You Customers (And How to Fix It)',       category: 'Technology', date: 'Dec 2025', readTime: '5 min', image: 'assets/images/portfolio/img-4.jpg', url: 'blog-single.html' },
          { id: 4, title: 'Launching an E-commerce Store in Nigeria: The Complete 2026 Checklist',   category: 'E-commerce', date: 'Nov 2025', readTime: '9 min', image: 'assets/images/portfolio/img-5.jpg', url: 'blog-single.html' },
          { id: 5, title: 'How to Validate Your Web App Idea Before Spending a Single Naira',        category: 'Business', date: 'Oct 2025', readTime: '6 min', image: 'assets/images/portfolio/img-6.jpg', url: 'blog-single.html' },
          { id: 6, title: 'Starting a Tech Career in Nigeria: What No One Tells You',                category: 'Career', date: 'Sep 2025', readTime: '4 min', image: 'assets/images/portfolio/img-7.jpg', url: 'blog-single.html' },
        ]
      }
    },
    {
      section: 'testimonials',
      data: {
        items: [
          { id: 1, name: 'Chukwuemeka Obi',  role: 'CEO, Obi Agro Supplies, Onitsha',        image: 'assets/images/section/tes-1.jpg', text: 'Goallord transformed our outdated website into a lead-generating machine. Within 3 months of launch, our online enquiries tripled. The team was professional, fast, and genuinely understood our business.' },
          { id: 2, name: 'Ngozi Adeleke',    role: 'Founder, StyleHaus Lagos',               image: 'assets/images/section/tes-2.jpg', text: 'Our Shopify store was beautifully designed and set up perfectly. Sales went up 40% in the first month. Goallord delivered exactly what they promised \u2014 on time and on budget.' },
          { id: 3, name: 'Daniel Eze',       role: 'Director, TechBridge Fintech, Enugu',    image: 'assets/images/section/tes-3.jpg', text: "They built our web app MVP in 6 weeks. Clean code, great UX, and the team was easy to work with throughout. We've since signed them on for maintenance and ongoing development." },
          { id: 4, name: 'Amaka Nwosu',      role: 'Principal, Starlight Academy, Awka',     image: 'assets/images/section/tes-2.jpg', text: 'The school website Goallord built for us is outstanding. Parents love it, registration went fully online, and we look credible. Worth every naira \u2014 highly recommended.' },
          { id: 5, name: 'Seun Balogun',     role: 'Founder, QuickFix Auto, Abuja',          image: 'assets/images/section/tes-1.jpg', text: 'Our Google ranking jumped from page 5 to page 1 for key search terms in Abuja. The SEO work and new website design from Goallord have been a game-changer for our workshop.' },
          { id: 6, name: 'Ifeoma Chime',     role: 'MD, Chime Medical Centre, Onitsha',      image: 'assets/images/section/tes-3.jpg', text: 'Goallord built our patient portal and booking system from scratch. It\'s been running flawlessly since launch. The team has deep technical knowledge and excellent communication.' },
        ]
      }
    }
  ];

  for (const s of sections) {
    const exists = await contentDb.findBySection(s.section);
    if (!exists) await contentDb.create(s);
  }
  console.log('Content seeded');
}

module.exports = router;
module.exports.seedContent = seedContent;
