const router      = require('express').Router();
const clientLogosDb = require('../db/clientLogos');
const { requireAuth } = require('../middleware/auth');

// Public – visible logos ordered by `order`
router.get('/public', async (req, res) => {
    try {
        const supabase = require('../lib/supabase');
        const { data: logos, error } = await supabase.from('client_logos').select('*').eq('visible', true).order('order');
        if (error) throw error;
        res.json(logos || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin – all logos
router.get('/', requireAuth, async (req, res) => {
    try {
        const logos = await clientLogosDb.findAll();
        res.json(logos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin – create
router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, image, imageId, order, visible } = req.body;
        const logo = await clientLogosDb.create({
            name, image,
            image_id: imageId || '',
            order:    order   ?? 0,
            visible:  visible ?? true
        });
        res.status(201).json(logo);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin – update
router.patch('/:id', requireAuth, async (req, res) => {
    try {
        const { name, image, imageId, order, visible } = req.body;
        const update = {};
        if (name !== undefined) update.name = name;
        if (image !== undefined) update.image = image;
        if (imageId !== undefined) update.image_id = imageId;
        if (order !== undefined) update.order = order;
        if (visible !== undefined) update.visible = visible;
        const supabase = require('../lib/supabase');
        const { data: logo, error } = await supabase.from('client_logos').update(update).eq('id', req.params.id).select().single();
        if (error) throw error;
        if (!logo) return res.status(404).json({ error: 'Logo not found' });
        res.json(logo);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin – delete
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        await clientLogosDb.remove(req.params.id);
        res.json({ message: 'Logo deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
