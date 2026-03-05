const express = require('express');
const Product = require('../models/Product');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/products — public sees active only; admin sees all
router.get('/', optionalAuth, async (req, res) => {
  try {
    const filter = req.user ? {} : { active: true };
    const { category } = req.query;
    if (category) filter.category = category;
    const docs = await Product.find(filter).sort({ createdAt: -1 });
    res.json({ data: docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const doc = await Product.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products — protected
router.post('/', requireAuth, async (req, res) => {
  try {
    const doc = await Product.create(req.body);
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/products/:id — protected
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/products/:id — protected
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Seed default products
async function seedProducts() {
  const count = await Product.countDocuments();
  if (count > 0) return;

  const defaults = [
    // Application Fees
    { name: 'Web Design Academy Fee',        category: 'Application Fee', price: 25,   currency: 'EUR', description: 'Application fee for Web Design track' },
    { name: 'WordPress Academy Fee',         category: 'Application Fee', price: 25,   currency: 'EUR', description: 'Application fee for WordPress track' },
    { name: 'Digital Marketing Academy Fee', category: 'Application Fee', price: 25,   currency: 'EUR', description: 'Application fee for Digital Marketing track' },
    // Templates
    { name: 'Agency Pro Template',           category: 'Template',        price: 49,   currency: 'EUR', description: 'Professional agency website template' },
    { name: 'E-commerce Starter Template',   category: 'Template',        price: 39,   currency: 'EUR', description: 'Ready-to-launch e-commerce template' },
    { name: 'Portfolio Minimal Template',    category: 'Template',        price: 29,   currency: 'EUR', description: 'Clean minimal portfolio template' },
    { name: 'Restaurant & Cafe Template',    category: 'Template',        price: 35,   currency: 'EUR', description: 'Beautiful food & hospitality template' },
    { name: 'Startup SaaS Template',         category: 'Template',        price: 59,   currency: 'EUR', description: 'Modern SaaS landing page template' },
    // Courses
    { name: 'Web Design Fundamentals',       category: 'Course',          price: 149,  currency: 'EUR', description: 'Complete web design from scratch' },
    { name: 'WordPress Mastery Course',      category: 'Course',          price: 129,  currency: 'EUR', description: 'Build any website with WordPress' },
    { name: 'Digital Marketing Blueprint',   category: 'Course',          price: 179,  currency: 'EUR', description: 'Social media, SEO & paid ads mastery' },
    { name: 'Brand Identity Design',         category: 'Course',          price: 99,   currency: 'EUR', description: 'Logo, color & brand system design' },
  ];

  await Product.insertMany(defaults);
  console.log('Products seeded');
}

module.exports = router;
module.exports.seedProducts = seedProducts;
