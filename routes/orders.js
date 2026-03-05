const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/orders — protected
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const skip = (Number(page) - 1) * Number(limit);
    const [docs, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate('productId', 'name category'),
      Order.countDocuments(filter)
    ]);
    res.json({ data: docs, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders — public (customer purchase)
router.post('/', async (req, res) => {
  try {
    const { productId, buyerName, buyerEmail } = req.body;
    if (!productId || !buyerName || !buyerEmail) {
      return res.status(400).json({ error: 'productId, buyerName and buyerEmail are required' });
    }
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const order = await Order.create({
      productId,
      buyerName,
      buyerEmail,
      amount: product.price,
      currency: product.currency,
      category: product.category,
      status: 'Pending'
    });
    res.status(201).json({ success: true, orderId: order.orderId, id: order._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/orders/:id — protected (update status)
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const doc = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
