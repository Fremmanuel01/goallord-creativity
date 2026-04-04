const router     = require('express').Router();
const checkInsDb = require('../db/checkIns');
const { requireAuth, requirePermission } = require('../middleware/auth');

// List check-ins (filter by user, date)
// Staff can always see their own; seeing all requires checkins permission
router.get('/', requireAuth, requirePermission('checkins'), async (req, res) => {
    try {
        const filter = {};
        if (req.query.user) filter.user_id = req.query.user;
        if (req.query.date) filter.date    = req.query.date;
        if (req.query.mine) filter.user_id = req.user.id;

        // Staff without explicit admin role see only their own check-ins
        // unless they are viewing the team feed (admin sees all)
        if (req.user.role !== 'admin' && !req.query.user && !req.query.mine) {
            filter.user_id = req.user.id;
        }

        const checkins = await checkInsDb.find(filter);
        res.json(checkins);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create or update today's check-in
router.post('/', requireAuth, requirePermission('checkins'), async (req, res) => {
    try {
        const { yesterday, today, blockers } = req.body;

        // Input validation: at least yesterday or today must have content
        if ((!yesterday || !yesterday.trim()) && (!today || !today.trim())) {
            return res.status(400).json({ error: 'At least one of "yesterday" or "today" must have content' });
        }

        const date = new Date().toISOString().slice(0, 10);

        // Upsert: check if one exists for today
        const supabase = require('../lib/supabase');
        const { data: existing } = await supabase
            .from('check_ins')
            .select('id')
            .eq('user_id', req.user.id)
            .eq('date', date)
            .limit(1)
            .maybeSingle();

        let checkin;
        if (existing) {
            const { data, error } = await supabase
                .from('check_ins')
                .update({ yesterday, today, blockers })
                .eq('id', existing.id)
                .select()
                .single();
            if (error) throw error;
            checkin = data;
        } else {
            checkin = await checkInsDb.create({
                user_id: req.user.id,
                date,
                yesterday,
                today,
                blockers
            });
        }

        res.json(checkin);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete
router.delete('/:id', requireAuth, requirePermission('checkins'), async (req, res) => {
    try {
        await checkInsDb.remove(req.params.id);
        res.json({ message: 'Check-in deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
