const router = require('express').Router();
const Project = require('../models/Project');
const Task    = require('../models/Task');
const { requireAuth, requirePermission } = require('../middleware/auth');

// List all projects (staff: only projects they are a member of)
router.get('/', requireAuth, requirePermission('projects'), async (req, res) => {
    try {
        const filter = {};
        if (req.query.status) filter.status = req.query.status;

        // Staff only see projects they are a member of or created
        if (req.user.role !== 'admin') {
            filter.$or = [
                { members: req.user.id },
                { createdBy: req.user.id }
            ];
        }

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
router.get('/:id', requireAuth, requirePermission('projects'), async (req, res) => {
    try {
        const project = await Project.findById(req.params.id)
            .populate('members', 'name email')
            .populate('createdBy', 'name');
        if (!project) return res.status(404).json({ error: 'Not found' });

        // Staff can only view projects they belong to
        if (req.user.role !== 'admin') {
            const isMember = project.members.some(m => m._id.toString() === req.user.id);
            const isCreator = project.createdBy && project.createdBy._id.toString() === req.user.id;
            if (!isMember && !isCreator) {
                return res.status(403).json({ error: 'You do not have access to this project' });
            }
        }

        res.json(project);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create
router.post('/', requireAuth, requirePermission('projects'), async (req, res) => {
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
router.patch('/:id', requireAuth, requirePermission('projects'), async (req, res) => {
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
router.delete('/:id', requireAuth, requirePermission('projects'), async (req, res) => {
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
