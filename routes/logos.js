const router = require('express').Router();
const ClientLogo = require('../models/ClientLogo');
const { requireAuth } = require('../middleware/auth');

// Public – visible logos ordered by `order`
router.get('/public', async (req, res) => {
    try {
        const logos = await ClientLogo.find({ visible: true }).sort({ order: 1 });
        res.json(logos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin – all logos
router.get('/', requireAuth, async (req, res) => {
    try {
        const logos = await ClientLogo.find().sort({ order: 1 });
        res.json(logos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin – create
router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, image, imageId, order, visible } = req.body;
        const logo = await ClientLogo.create({
            name, image,
            imageId: imageId || '',
            order:   order   ?? 0,
            visible: visible ?? true
        });
        res.status(201).json(logo);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin – update
router.patch('/:id', requireAuth, async (req, res) => {
    try {
        const logo = await ClientLogo.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!logo) return res.status(404).json({ error: 'Logo not found' });
        res.json(logo);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin – delete
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const logo = await ClientLogo.findByIdAndDelete(req.params.id);
        if (!logo) return res.status(404).json({ error: 'Logo not found' });
        res.json({ message: 'Logo deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
