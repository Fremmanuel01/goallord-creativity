const router        = require('express').Router();
const teamMembersDb = require('../db/teamMembers');
const { requireAuth } = require('../middleware/auth');

// Public – visible members ordered by `order`
router.get('/public', async (req, res) => {
    try {
        const supabase = require('../lib/supabase');
        const { data: members, error } = await supabase.from('team_members').select('*').eq('visible', true).order('order');
        if (error) throw error;
        res.json(members || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin – all members
router.get('/', requireAuth, async (req, res) => {
    try {
        const members = await teamMembersDb.findAll();
        res.json(members);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin – single member
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const supabase = require('../lib/supabase');
        const { data: member, error } = await supabase.from('team_members').select('*').eq('id', req.params.id).single();
        if (error) throw error;
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
        const member = await teamMembersDb.create({
            name, role,
            photo:    photo    || '',
            photo_id: photoId  || '',
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
        const { name, role, photo, photoId, linkedin, github, twitter, order, visible } = req.body;
        const update = {};
        if (name !== undefined) update.name = name;
        if (role !== undefined) update.role = role;
        if (photo !== undefined) update.photo = photo;
        if (photoId !== undefined) update.photo_id = photoId;
        if (linkedin !== undefined) update.linkedin = linkedin;
        if (github !== undefined) update.github = github;
        if (twitter !== undefined) update.twitter = twitter;
        if (order !== undefined) update.order = order;
        if (visible !== undefined) update.visible = visible;
        const member = await teamMembersDb.update(req.params.id, update);
        if (!member) return res.status(404).json({ error: 'Member not found' });
        res.json(member);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin – delete
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        await teamMembersDb.remove(req.params.id);
        res.json({ message: 'Member deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
