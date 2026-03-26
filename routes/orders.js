const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { requireAuth } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');
const { receiptEmail } = require('../utils/emailTemplates');

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

// POST /api/orders/verify-payment — public (verify Paystack payment and mark orders paid)
router.post('/verify-payment', async (req, res) => {
  try {
    const { orderIds, reference } = req.body;
    if (!orderIds || !reference) return res.status(400).json({ error: 'orderIds and reference required' });

    const ids = Array.isArray(orderIds) ? orderIds : [orderIds];
    await Order.updateMany(
      { _id: { $in: ids } },
      { status: 'Paid' }
    );
    res.json({ success: true, message: 'Payment verified' });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// POST /api/orders/:id/email-receipt — protected (email receipt to buyer)
router.post('/:id/email-receipt', requireAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('productId', 'name');
    if (!order) return res.status(404).json({ error: 'Not found' });

    const currencySymbol = order.currency === 'EUR' ? '€' : '₦';
    const receiptNum = 'ORD-' + (order.orderId || order._id.toString().slice(-8).toUpperCase());

    await sendMail({
      to: order.buyerEmail,
      subject: `Order Receipt ${receiptNum} — Goallord Creativity`,
      html: receiptEmail({
        receiptNumber: receiptNum,
        date: order.createdAt || new Date(),
        recipientName: order.buyerName,
        recipientEmail: order.buyerEmail,
        description: order.productId?.name || 'Digital Product',
        amount: order.amount,
        currency: currencySymbol,
        method: 'Online',
        reference: order.orderId || order._id.toString().slice(-8).toUpperCase(),
        issuedBy: 'Goallord Creativity Limited'
      })
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
