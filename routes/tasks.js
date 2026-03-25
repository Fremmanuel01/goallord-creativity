const router = require('express').Router();
const Task = require('../models/Task');
const { requireAuth } = require('../middleware/auth');

// List tasks (filter by project, assignee, status)
router.get('/', requireAuth, async (req, res) => {
    try {
        const filter = {};
        if (req.query.project)  filter.project  = req.query.project;
        if (req.query.assignee) filter.assignee  = req.query.assignee;
        if (req.query.status)   filter.status    = req.query.status;
        if (req.query.mine)     filter.assignee  = req.user.id;
        const tasks = await Task.find(filter)
            .populate('assignee', 'name email')
            .populate('project', 'name color')
            .sort({ priority: -1, dueDate: 1 });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Single task
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id)
            .populate('assignee', 'name email')
            .populate('project', 'name');
        if (!task) return res.status(404).json({ error: 'Not found' });
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create
router.post('/', requireAuth, async (req, res) => {
    try {
        const { title, description, project, assignee, status, priority, dueDate } = req.body;
        const task = await Task.create({
            title, description, project,
            assignee: assignee || null,
            status: status || 'todo',
            priority: priority || 'medium',
            dueDate: dueDate || null,
            createdBy: req.user.id
        });
        const populated = await task.populate([
            { path: 'assignee', select: 'name email' },
            { path: 'project', select: 'name color' }
        ]);
        res.status(201).json(populated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update
router.patch('/:id', requireAuth, async (req, res) => {
    try {
        const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
            .populate('assignee', 'name email')
            .populate('project', 'name color');
        if (!task) return res.status(404).json({ error: 'Not found' });
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const task = await Task.findByIdAndDelete(req.params.id);
        if (!task) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Task deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
