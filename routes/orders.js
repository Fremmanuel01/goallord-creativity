const express = require('express');
const https = require('https');
const ordersDb   = require('../db/orders');
const productsDb = require('../db/products');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');
const { receiptEmail } = require('../utils/emailTemplates');
const rateLimit = require('express-rate-limit');
const xss = require('xss');

const router = express.Router();

// ── Paystack server-side verification ──
function verifyPaystack(reference) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.paystack.co',
            path: '/transaction/verify/' + encodeURIComponent(reference),
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + process.env.PAYSTACK_SECRET_KEY }
        };
        const req = https.request(options, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// ── Order confirmation email template ──
function buildOrderConfirmationEmail(name, downloadLinks, reference, orders) {
    const totalUSD = orders.reduce((s, o) => s + (o.currency === 'NGN' ? o.amount / 1560 : o.amount), 0);
    const productList = downloadLinks.map(item => {
        if (item.url) {
            return '<li style="padding:10px 0;color:#d1d5db;font-size:14px;border-bottom:1px solid #1e2432">' + item.name + '<br><a href="' + item.url + '" style="display:inline-block;margin-top:6px;background:rgba(232,120,42,0.15);border:1px solid rgba(232,120,42,0.3);color:#E8782A;text-decoration:none;padding:6px 16px;border-radius:6px;font-size:12px;font-weight:600">Download File</a><br><span style="font-size:11px;color:#6b7280;margin-top:4px;display:inline-block">Link expires in 72 hours</span></li>';
        }
        return '<li style="padding:10px 0;color:#d1d5db;font-size:14px;border-bottom:1px solid #1e2432">' + item.name + '<br><span style="font-size:12px;color:#6b7280">Download will be sent separately by our team</span></li>';
    }).join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#080a0e;font-family:-apple-system,sans-serif">
<div style="max-width:560px;margin:0 auto">
  <div style="height:4px;background:linear-gradient(90deg,#E8782A,#FF9F43,#E8782A)"></div>
  <div style="background:#0d1017;padding:40px 32px;text-align:center">
    <div style="display:inline-block;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.25);border-radius:50%;width:72px;height:72px;line-height:72px;margin-bottom:20px">
      <span style="font-size:28px">&#9989;</span>
    </div>
    <h1 style="color:#fff;font-size:24px;margin:0 0 8px">Order Confirmed!</h1>
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px">Reference: ${reference}</p>
    <p style="color:#d1d5db;font-size:15px;line-height:1.7;text-align:left">Hi <strong style="color:#fff">${name.split(' ')[0]}</strong>, thank you for your purchase. Here is your order summary:</p>
    <div style="background:#141820;border:1px solid #1e2432;border-radius:12px;padding:20px 24px;margin:20px 0;text-align:left">
      <p style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px">Products</p>
      <ul style="list-style:none;padding:0;margin:0">${productList}</ul>
      <div style="border-top:1px solid #1e2432;margin-top:12px;padding-top:12px">
        <p style="margin:0;font-size:18px;font-weight:700;color:#E8782A">Total: $${Math.round(totalUSD)}</p>
      </div>
    </div>
    <p style="color:#d1d5db;font-size:14px;line-height:1.7;text-align:left">We will send your download links shortly. If you have questions, reply to this email or contact us at hello@goallordcreativity.com</p>
    <a href="https://goallordcreativity.com/shop.html" style="display:inline-block;background:linear-gradient(135deg,#E8782A,#FF9F43);color:#fff;text-decoration:none;padding:14px 40px;border-radius:10px;font-weight:700;font-size:15px;margin:24px 0">Back to Shop</a>
  </div>
  <div style="background:#080a0e;padding:20px 32px;text-align:center;border-top:1px solid #141820">
    <p style="margin:0;font-size:11px;color:#374151">Goallord Creativity Limited, Onitsha</p>
  </div>
</div></body></html>`;
}

// ── Rate limiter for order creation ──
const orderLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many orders. Try again later.' } });

// GET /api/orders — protected
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const result = await ordersDb.find({ filter, populate: 'product', page: Number(page), limit: Number(limit) });
    res.json({ data: result.data, total: result.count, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/paystack-key — public (returns public key only)
router.get('/paystack-key', (req, res) => {
    res.json({ key: process.env.PAYSTACK_PUBLIC_KEY });
});

// POST /api/orders — public (customer purchase) with rate limiting, validation, XSS
router.post('/', orderLimiter, async (req, res) => {
    try {
        const { productId, buyerName, buyerEmail } = req.body;
        if (!productId || !buyerName || !buyerEmail) return res.status(400).json({ error: 'All fields required' });
        if (buyerName.length > 100) return res.status(400).json({ error: 'Name too long' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) return res.status(400).json({ error: 'Invalid email' });

        const product = await productsDb.findById(productId);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        if (!product.active) return res.status(400).json({ error: 'Product is not available' });

        const order = await ordersDb.create({
            product_id: productId,
            buyer_name: xss(buyerName.trim()),
            buyer_email: buyerEmail.toLowerCase().trim(),
            amount: product.price,  // ALWAYS use DB price, never client
            currency: product.currency,
            category: product.category,
            status: 'Pending'
        });
        res.status(201).json({ success: true, orderId: order.order_id, id: order.id, amount: product.price, currency: product.currency });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST /api/orders/verify-payment — public (verify Paystack payment and mark orders paid)
router.post('/verify-payment', async (req, res) => {
    try {
        const { orderIds, reference } = req.body;
        if (!orderIds || !reference) return res.status(400).json({ error: 'orderIds and reference required' });

        // Verify with Paystack
        const verification = await verifyPaystack(reference);
        if (!verification || !verification.data || verification.data.status !== 'success') {
            return res.status(400).json({ error: 'Payment verification failed. Transaction not successful.' });
        }

        // Get orders and verify amount
        const ids = Array.isArray(orderIds) ? orderIds : [orderIds];
        const result = await ordersDb.find({ inFilter: { id: ids } });
        const orders = result.data;
        if (!orders.length) return res.status(404).json({ error: 'Orders not found' });

        // Calculate expected amount in kobo (orders are in USD, convert to NGN at 1560)
        const USD_TO_NGN = 1560;
        const totalExpected = orders.reduce((sum, o) => {
            const amountNGN = o.currency === 'NGN' ? o.amount : o.amount * USD_TO_NGN;
            return sum + Math.round(amountNGN * 100);
        }, 0);

        const paidAmount = verification.data.amount; // in kobo
        // Allow 5% tolerance for rounding
        if (paidAmount < totalExpected * 0.95) {
            return res.status(400).json({ error: 'Amount mismatch. Expected ' + totalExpected + ' kobo, got ' + paidAmount });
        }

        // Mark orders as paid and generate download tokens
        const crypto = require('crypto');
        const downloadLinks = [];
        for (const order of orders) {
            const token = crypto.randomBytes(32).toString('hex');
            const expires = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours
            await ordersDb.update(order.id, {
                status: 'Paid',
                download_token: token,
                download_expires: expires.toISOString()
            });

            const product = await productsDb.findById(order.product_id);
            if (product && product.download_url) {
                const host = process.env.HOST || 'https://goallordcreativity.com';
                downloadLinks.push({
                    name: product.name,
                    url: host + '/api/orders/download/' + order.id + '?token=' + token
                });
            } else if (product) {
                downloadLinks.push({ name: product.name, url: null });
            }
        }

        // Send confirmation email with download links
        const buyer = orders[0];
        try {
            await sendMail({
                to: buyer.buyer_email,
                subject: 'Order Confirmed \u2014 Goallord Creativity',
                html: buildOrderConfirmationEmail(buyer.buyer_name, downloadLinks, verification.data.reference, orders)
            });
        } catch(emailErr) {
            console.error('Order confirmation email failed:', emailErr.message);
        }

        res.json({ success: true, message: 'Payment verified and confirmed', downloads: downloadLinks });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/orders/download/:id — secure download (requires valid token)
router.get('/download/:id', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(401).send('<h2>Access Denied</h2><p>No download token provided.</p>');

        const order = await ordersDb.findById(req.params.id);
        if (!order) return res.status(404).send('<h2>Not Found</h2><p>Order not found.</p>');
        if (order.status !== 'Paid') return res.status(403).send('<h2>Payment Required</h2><p>This order has not been paid.</p>');
        if (order.download_token !== token) return res.status(403).send('<h2>Invalid Token</h2><p>This download link is not valid.</p>');
        if (order.download_expires && new Date(order.download_expires) < new Date()) return res.status(410).send('<h2>Link Expired</h2><p>This download link has expired. Contact hello@goallordcreativity.com for a new link.</p>');

        const product = await productsDb.findById(order.product_id);
        if (!product || !product.download_url) return res.status(404).send('<h2>No Download Available</h2><p>This product does not have a downloadable file yet. Contact hello@goallordcreativity.com</p>');

        // Redirect to the actual download URL
        res.redirect(product.download_url);
    } catch (err) {
        res.status(500).send('<h2>Error</h2><p>' + err.message + '</p>');
    }
});

// PATCH /api/orders/:id — protected (update status)
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const doc = await ordersDb.update(req.params.id, { status });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/orders/:id — admin only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await ordersDb.remove(req.params.id);
        res.json({ message: 'Order deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/orders/:id/email-receipt — protected (email receipt to buyer)
router.post('/:id/email-receipt', requireAuth, async (req, res) => {
  try {
    const order = await ordersDb.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Not found' });

    const currencySymbol = order.currency === 'EUR' ? '\u20AC' : order.currency === 'NGN' ? '\u20A6' : '$';
    const receiptNum = 'ORD-' + (order.order_id || order.id.toString().slice(-8).toUpperCase());

    await sendMail({
      to: order.buyer_email,
      subject: `Order Receipt ${receiptNum} \u2014 Goallord Creativity`,
      html: receiptEmail({
        receiptNumber: receiptNum,
        date: order.created_at || new Date(),
        recipientName: order.buyer_name,
        recipientEmail: order.buyer_email,
        description: order.product?.name || 'Digital Product',
        amount: order.amount,
        currency: currencySymbol,
        method: 'Online',
        reference: order.order_id || order.id.toString().slice(-8).toUpperCase(),
        issuedBy: 'Goallord Creativity Limited'
      })
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
