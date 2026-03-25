const router = require('express').Router();
const Project = require('../models/Project');
const Task    = require('../models/Task');
const { requireAuth } = require('../middleware/auth');

// List all projects
router.get('/', requireAuth, async (req, res) => {
    try {
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        const projects = await Project.find(filter)
            .populate('members', 'name email')
            .populate('createdBy', 'name')
            .sort({ updatedAt: -1 });

        // Attach task counts
        const result = await Promise.all(projects.map(async p => {
            const pObj = p.toObject();
            pObj.taskCount = await Task.countDocuments({ project: p._id });
            pObj.tasksDone = await Task.countDocuments({ project: p._id, status: 'done' });
            return pObj;
        }));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Single project
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const project = await Project.findById(req.params.id)
            .populate('members', 'name email')
            .populate('createdBy', 'name');
        if (!project) return res.status(404).json({ error: 'Not found' });
        res.json(project);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create
router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, client, description, status, priority, deadline, members, color } = req.body;
        const project = await Project.create({
            name, client, description, status, priority, deadline,
            members: members || [],
            color: color || '#D66A1F',
            createdBy: req.user.id
        });
        res.status(201).json(project);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update
router.patch('/:id', requireAuth, async (req, res) => {
    try {
        const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
            .populate('members', 'name email');
        if (!project) return res.status(404).json({ error: 'Not found' });
        res.json(project);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete (and its tasks)
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const project = await Project.findByIdAndDelete(req.params.id);
        if (!project) return res.status(404).json({ error: 'Not found' });
        await Task.deleteMany({ project: req.params.id });
        res.json({ message: 'Project and tasks deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
