const router     = require('express').Router();
const projectsDb = require('../db/projects');
const tasksDb    = require('../db/tasks');
const { requireAuth, requirePermission } = require('../middleware/auth');

// List all projects (staff: only projects they are a member of)
router.get('/', requireAuth, requirePermission('projects'), async (req, res) => {
    try {
        const filter = {};
        if (req.query.status) filter.status = req.query.status;

        // Staff only see projects they are a member of or created
        const userId = req.user.role !== 'admin' ? req.user.id : undefined;

        const projects = await projectsDb.findAll(filter, userId);

        // If non-admin, also include projects they created
        let result;
        if (req.user.role !== 'admin') {
            const allProjects = await projectsDb.findAll(filter);
            const createdByUser = allProjects.filter(p => p.created_by === req.user.id);
            const projectIds = new Set(projects.map(p => p.id));
            for (const p of createdByUser) {
                if (!projectIds.has(p.id)) projects.push(p);
            }
        }

        // Attach task counts
        result = await Promise.all(projects.map(async p => {
            const tasks = await tasksDb.findByProject(p.id);
            p.taskCount = tasks.length;
            p.tasksDone = tasks.filter(t => t.status === 'done').length;
            return p;
        }));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Single project
router.get('/:id', requireAuth, requirePermission('projects'), async (req, res) => {
    try {
        const project = await projectsDb.findById(req.params.id);
        if (!project) return res.status(404).json({ error: 'Not found' });

        // Staff can only view projects they belong to
        if (req.user.role !== 'admin') {
            const isMember = (project.members || []).some(m => m.id === req.user.id);
            const isCreator = project.created_by === req.user.id;
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

        // Input validation
        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ error: 'Project name is required and must be a string' });
        }
        const validStatuses = ['not-started', 'in-progress', 'review', 'completed'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
        }
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        if (priority && !validPriorities.includes(priority)) {
            return res.status(400).json({ error: 'Invalid priority. Must be one of: ' + validPriorities.join(', ') });
        }

        const project = await projectsDb.create({
            name, client, description, status, priority, deadline,
            members: members || [],
            color: color || '#D66A1F',
            created_by: req.user.id
        });
        res.status(201).json(project);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update
router.patch('/:id', requireAuth, requirePermission('projects'), async (req, res) => {
    try {
        // Permission check: admin or project member/creator
        if (req.user.role !== 'admin') {
            const existing = await projectsDb.findById(req.params.id);
            if (!existing) return res.status(404).json({ error: 'Not found' });
            const isMember = (existing.members || []).some(m => m.id === req.user.id);
            const isCreator = existing.created_by === req.user.id;
            if (!isMember && !isCreator) {
                return res.status(403).json({ error: 'You can only update projects you belong to' });
            }
        }

        const { name, client, description, status, priority, deadline, members, color, budget, spent } = req.body;
        const updateFields = {};
        if (name !== undefined) updateFields.name = name;
        if (client !== undefined) updateFields.client = client;
        if (description !== undefined) updateFields.description = description;
        if (status !== undefined) updateFields.status = status;
        if (priority !== undefined) updateFields.priority = priority;
        if (deadline !== undefined) updateFields.deadline = deadline;
        if (members !== undefined) updateFields.members = members;
        if (color !== undefined) updateFields.color = color;
        if (budget !== undefined) updateFields.budget = budget;
        if (spent !== undefined) updateFields.spent = spent;

        const project = await projectsDb.update(req.params.id, updateFields);
        if (!project) return res.status(404).json({ error: 'Not found' });
        res.json(project);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete (and its tasks)
router.delete('/:id', requireAuth, requirePermission('projects'), async (req, res) => {
    try {
        // Permission check: only admin or project creator can delete
        if (req.user.role !== 'admin') {
            const existing = await projectsDb.findById(req.params.id);
            if (!existing) return res.status(404).json({ error: 'Not found' });
            if (!existing.created_by || existing.created_by !== req.user.id) {
                return res.status(403).json({ error: 'Only the project creator or admin can delete this project' });
            }
        }

        // Delete tasks first
        const tasks = await tasksDb.findByProject(req.params.id);
        for (const task of tasks) {
            await tasksDb.remove(task.id);
        }

        await projectsDb.remove(req.params.id);
        res.json({ message: 'Project and tasks deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
