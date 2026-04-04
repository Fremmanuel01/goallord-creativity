const router     = require('express').Router();
const tasksDb    = require('../db/tasks');
const projectsDb = require('../db/projects');
const { requireAuth, requirePermission } = require('../middleware/auth');

// List tasks (filter by project, assignee, status)
// Staff: only see tasks assigned to them
router.get('/', requireAuth, requirePermission('tasks'), async (req, res) => {
    try {
        const filter = {};
        if (req.query.project)  filter.project_id  = req.query.project;
        if (req.query.assignee) filter.assignee_id  = req.query.assignee;
        if (req.query.status)   filter.status       = req.query.status;
        if (req.query.mine)     filter.assignee_id  = req.user.id;
        if (req.query.priority) filter.priority     = req.query.priority;

        // Staff can only see their own tasks
        if (req.user.role !== 'admin') {
            filter.assignee_id = req.user.id;
        }

        const tasks = await tasksDb.find({ filter, search: req.query.search });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Single task
router.get('/:id', requireAuth, requirePermission('tasks'), async (req, res) => {
    try {
        const task = await tasksDb.findById(req.params.id);
        if (!task) return res.status(404).json({ error: 'Not found' });

        // Staff can only view tasks assigned to them
        if (req.user.role !== 'admin') {
            if (!task.assignee || task.assignee.id !== req.user.id) {
                return res.status(403).json({ error: 'You do not have access to this task' });
            }
        }

        res.json(task);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create
router.post('/', requireAuth, requirePermission('tasks'), async (req, res) => {
    try {
        const { title, description, project, assignee, status, priority, dueDate, estimated, spent, blockedBy } = req.body;

        // Input validation
        if (!title || typeof title !== 'string' || !title.trim()) {
            return res.status(400).json({ error: 'Title is required and must be a string' });
        }
        const validStatuses = ['todo', 'in-progress', 'review', 'done'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
        }
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        if (priority && !validPriorities.includes(priority)) {
            return res.status(400).json({ error: 'Invalid priority. Must be one of: ' + validPriorities.join(', ') });
        }

        const task = await tasksDb.create({
            title, description,
            project_id: project || null,
            assignee_id: assignee || null,
            status: status || 'todo',
            priority: priority || 'medium',
            due_date: dueDate || null,
            estimated: estimated || 0,
            spent: spent || 0,
            blocked_by: Array.isArray(blockedBy) ? blockedBy : [],
            created_by: req.user.id
        });
        // Re-fetch with populated fields
        const populated = await tasksDb.findById(task.id);
        res.status(201).json(populated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update
router.patch('/:id', requireAuth, requirePermission('tasks'), async (req, res) => {
    try {
        // Permission check: admin or task assignee/creator
        if (req.user.role !== 'admin') {
            const existing = await tasksDb.findById(req.params.id);
            if (!existing) return res.status(404).json({ error: 'Not found' });
            if (existing.assignee_id && existing.assignee_id !== req.user.id &&
                existing.created_by && existing.created_by !== req.user.id) {
                return res.status(403).json({ error: 'You can only update your own tasks' });
            }
        }

        const { title, description, assignee, status, priority, dueDate, estimated, spent, blockedBy } = req.body;
        const updateFields = {};
        if (title !== undefined) updateFields.title = title;
        if (description !== undefined) updateFields.description = description;
        if (assignee !== undefined) updateFields.assignee_id = assignee;
        if (status !== undefined) updateFields.status = status;
        if (priority !== undefined) updateFields.priority = priority;
        if (dueDate !== undefined) updateFields.due_date = dueDate;
        if (estimated !== undefined) updateFields.estimated = estimated;
        if (spent !== undefined) updateFields.spent = spent;
        if (blockedBy !== undefined) updateFields.blocked_by = blockedBy;

        const task = await tasksDb.update(req.params.id, updateFields);
        if (!task) return res.status(404).json({ error: 'Not found' });

        // Re-fetch with populated fields
        const populated = await tasksDb.findById(task.id);

        // Auto-transition project status
        const projectId = populated.project_id || (populated.project && populated.project.id);
        if (projectId) {
            const projectTasks = await tasksDb.findByProject(projectId);
            const allDone = projectTasks.length > 0 && projectTasks.every(t => t.status === 'done');
            const anyActive = projectTasks.some(t => ['in-progress','review'].includes(t.status));

            if (allDone) {
                await projectsDb.update(projectId, { status: 'completed' });
            } else if (anyActive) {
                const proj = await projectsDb.findById(projectId);
                if (proj && proj.status === 'not-started') {
                    await projectsDb.update(projectId, { status: 'in-progress' });
                }
            }
        }

        res.json(populated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete
router.delete('/:id', requireAuth, requirePermission('tasks'), async (req, res) => {
    try {
        // Permission check: admin or task assignee/creator
        if (req.user.role !== 'admin') {
            const existing = await tasksDb.findById(req.params.id);
            if (!existing) return res.status(404).json({ error: 'Not found' });
            if (existing.assignee_id && existing.assignee_id !== req.user.id &&
                existing.created_by && existing.created_by !== req.user.id) {
                return res.status(403).json({ error: 'You can only delete your own tasks' });
            }
        }

        await tasksDb.remove(req.params.id);
        res.json({ message: 'Task deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add comment to task
router.post('/:id/comments', requireAuth, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ error: 'Comment text is required' });

        // Verify task exists
        const task = await tasksDb.findById(req.params.id);
        if (!task) return res.status(404).json({ error: 'Task not found' });

        await tasksDb.addComment(req.params.id, { user_id: req.user.id, text: text.trim() });

        const updated = await tasksDb.findById(req.params.id);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete comment from task
router.delete('/:id/comments/:commentId', requireAuth, async (req, res) => {
    try {
        const task = await tasksDb.findById(req.params.id);
        if (!task) return res.status(404).json({ error: 'Task not found' });

        const comment = (task.comments || []).find(c => c.id === req.params.commentId);
        if (!comment) return res.status(404).json({ error: 'Comment not found' });

        // Only admin or comment author can delete
        const commentUserId = comment.user_id || (comment.user && comment.user.id);
        if (req.user.role !== 'admin' && commentUserId !== req.user.id) {
            return res.status(403).json({ error: 'You can only delete your own comments' });
        }

        await tasksDb.removeComment(req.params.commentId);

        const updated = await tasksDb.findById(req.params.id);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
