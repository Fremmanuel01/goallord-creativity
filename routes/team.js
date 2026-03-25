const router = require('express').Router();
const TeamMember = require('../models/TeamMember');
const { requireAuth } = require('../middleware/auth');

// Public – visible members ordered by `order`
router.get('/public', async (req, res) => {
    try {
        const members = await TeamMember.find({ visible: true }).sort({ order: 1 });
        res.json(members);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin – all members
router.get('/', requireAuth, async (req, res) => {
    try {
        const members = await TeamMember.find().sort({ order: 1 });
        res.json(members);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin – single member
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const member = await TeamMember.findById(req.params.id);
        if (!member) return res.status(404).json({ error: 'Member not found' });
        res.json(member);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin – create
router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, role, photo, photoId, linkedin, github, twitter, order, visible } = req.body;
        const member = await TeamMember.create({
            name, role,
            photo:    photo    || '',
            photoId:  photoId  || '',
            linkedin: linkedin || '',
            github:   github   || '',
            twitter:  twitter  || '',
            order:    order    ?? 0,
            visible:  visible  ?? true
        });
        res.status(201).json(member);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin – update
router.patch('/:id', requireAuth, async (req, res) => {
    try {
        const member = await TeamMember.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!member) return res.status(404).json({ error: 'Member not found' });
        res.json(member);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin – delete
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const member = await TeamMember.findByIdAndDelete(req.params.id);
        if (!member) return res.status(404).json({ error: 'Member not found' });
        res.json({ message: 'Member deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
