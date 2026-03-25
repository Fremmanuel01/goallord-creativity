const router = require('express').Router();
const CheckIn = require('../models/CheckIn');
const { requireAuth } = require('../middleware/auth');

// List check-ins (filter by user, date)
router.get('/', requireAuth, async (req, res) => {
    try {
        const filter = {};
        if (req.query.user) filter.user = req.query.user;
        if (req.query.date) filter.date = req.query.date;
        if (req.query.mine) filter.user = req.user.id;
        const checkins = await CheckIn.find(filter)
            .populate('user', 'name email')
            .sort({ date: -1, createdAt: -1 })
            .limit(parseInt(req.query.limit) || 50);
        res.json(checkins);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create or update today's check-in
router.post('/', requireAuth, async (req, res) => {
    try {
        const { yesterday, today, blockers } = req.body;
        const date = new Date().toISOString().slice(0, 10);
        const checkin = await CheckIn.findOneAndUpdate(
            { user: req.user.id, date },
            { yesterday, today, blockers },
            { new: true, upsert: true, runValidators: true }
        );
        const populated = await checkin.populate('user', 'name email');
        res.json(populated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const checkin = await CheckIn.findByIdAndDelete(req.params.id);
        if (!checkin) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Check-in deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
