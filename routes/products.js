const express = require('express');
const Product = require('../models/Product');
const { requireAuth, optionalAuth, requireAdmin } = require('../middleware/auth');

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

// POST /api/products — admin only, with field whitelisting
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, category, price, currency, description, stock, active, image, type, demoUrl, features, downloadUrl } = req.body;
    const cleanCurrency = (currency === '₦' || currency === 'NGN') ? 'NGN' : 'USD';
    const cleanStock = (stock === 'Digital' || stock === 'Unlimited' || stock === '' || stock === undefined) ? -1 : Number(stock) || -1;
    const doc = await Product.create({ name, category, price, currency: cleanCurrency, description, stock: cleanStock, active, image, type, demoUrl, features, downloadUrl });
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/products/:id — admin only, with field whitelisting
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, category, price, currency, description, stock, active, image, type, demoUrl, features, downloadUrl } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (category !== undefined) updates.category = category;
    if (price !== undefined) updates.price = price;
    if (currency !== undefined) updates.currency = (currency === '₦' || currency === 'NGN') ? 'NGN' : 'USD';
    if (description !== undefined) updates.description = description;
    if (stock !== undefined) updates.stock = (stock === 'Digital' || stock === 'Unlimited' || stock === '') ? -1 : Number(stock) || -1;
    if (active !== undefined) updates.active = active;
    if (image !== undefined) updates.image = image;
    if (type !== undefined) updates.type = type;
    if (demoUrl !== undefined) updates.demoUrl = demoUrl;
    if (features !== undefined) updates.features = features;
    if (downloadUrl !== undefined) updates.downloadUrl = downloadUrl;

    const doc = await Product.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/products/:id — admin only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
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
    // Application Fees (for academy — not shown in public store)
    { name: 'Web Design Academy Fee',        category: 'Application Fee', price: 25,   currency: 'USD', description: 'Application fee for Web Design track' },
    { name: 'WordPress Academy Fee',         category: 'Application Fee', price: 25,   currency: 'USD', description: 'Application fee for WordPress track' },
    { name: 'Digital Marketing Academy Fee', category: 'Application Fee', price: 25,   currency: 'USD', description: 'Application fee for Digital Marketing track' },

    // Templates
    { name: 'Agency Pro Template',   category: 'Template', price: 79,  currency: 'USD', type: 'HTML/CSS/JS',    description: 'Premium agency website template with GSAP animations, dark theme, responsive design, and modern layout sections.',     features: ['GSAP Animations', 'Dark Theme', 'Responsive', '15+ Sections', 'Contact Form', 'SEO Optimized'] },
    { name: 'Portfolio Starter',     category: 'Template', price: 49,  currency: 'USD', type: 'HTML/CSS',       description: 'Clean portfolio template for creatives and designers. Minimal layout with smooth scroll and gallery.',                  features: ['Minimal Design', 'Gallery Grid', 'Smooth Scroll', 'Light & Dark Mode', 'Responsive'] },
    { name: 'Business Starter',      category: 'Template', price: 59,  currency: 'USD', type: 'WordPress Theme', description: 'Professional business WordPress theme with WooCommerce ready, multiple page templates, and easy customizer.',           features: ['WooCommerce Ready', 'Page Templates', 'Customizer', 'Blog Layout', 'Contact Forms', 'Responsive'] },
    { name: 'SaaS Launch Kit',       category: 'Template', price: 99,  currency: 'USD', type: 'React/Next.js',  description: 'SaaS landing page template with authentication, dashboard UI, and Stripe integration. Built with Next.js and Tailwind.', features: ['Auth Pages', 'Dashboard UI', 'Stripe Integration', 'Tailwind CSS', 'API Routes', 'Responsive'] },

    // Plugins
    { name: 'School Portal System',       category: 'Plugin', price: 199, currency: 'USD', type: 'WordPress Plugin', description: 'Complete school management system: student portal, results management, fee payments, attendance tracking, and parent access.',   features: ['Student Portal', 'Results Management', 'Fee Payments', 'Attendance Tracking', 'Parent Access', 'SMS Notifications'] },
    { name: 'Church Management Plugin',   category: 'Plugin', price: 149, currency: 'USD', type: 'WordPress Plugin', description: 'Full church management: member database, online giving, event calendar, sermon archive, and group management.',               features: ['Member Database', 'Online Giving', 'Event Calendar', 'Sermon Archive', 'Group Management', 'Email Notifications'] },

    // Web Apps
    { name: 'Hospital Booking System',    category: 'Web App', price: 499, currency: 'USD', type: 'Node.js/React', description: 'Patient appointment booking system with doctor schedules, SMS reminders, admin dashboard, and patient records management.',     features: ['Appointment Booking', 'Doctor Schedules', 'SMS Reminders', 'Admin Dashboard', 'Patient Records', 'Payment Integration'] },
    { name: 'E-learning Platform',        category: 'Web App', price: 399, currency: 'USD', type: 'Node.js/React', description: 'Complete e-learning platform with course management, video hosting, quizzes, certificates, and integrated payment system.',       features: ['Course Management', 'Video Hosting', 'Quizzes & Exams', 'Certificates', 'Payment Integration', 'Student Dashboard'] },
  ];

  await Product.insertMany(defaults);
  console.log('Products seeded');
}

module.exports = router;
module.exports.seedProducts = seedProducts;
