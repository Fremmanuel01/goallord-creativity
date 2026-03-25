const router = require('express').Router();
const Task = require('../models/Task');
const { requireAuth, requirePermission } = require('../middleware/auth');

// List tasks (filter by project, assignee, status)
// Staff: only see tasks assigned to them
router.get('/', requireAuth, requirePermission('tasks'), async (req, res) => {
    try {
        const filter = {};
        if (req.query.project)  filter.project  = req.query.project;
        if (req.query.assignee) filter.assignee  = req.query.assignee;
        if (req.query.status)   filter.status    = req.query.status;
        if (req.query.mine)     filter.assignee  = req.user.id;
        if (req.query.priority) filter.priority  = req.query.priority;
        if (req.query.search)   filter.title     = { $regex: req.query.search, $options: 'i' };
        if (req.query.dueBefore || req.query.dueAfter) {
            filter.dueDate = {};
            if (req.query.dueBefore) filter.dueDate.$lte = new Date(req.query.dueBefore);
            if (req.query.dueAfter)  filter.dueDate.$gte = new Date(req.query.dueAfter);
        }

        // Staff can only see their own tasks
        if (req.user.role !== 'admin') {
            filter.assignee = req.user.id;
        }

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
router.get('/:id', requireAuth, requirePermission('tasks'), async (req, res) => {
    try {
        const task = await Task.findById(req.params.id)
            .populate('assignee', 'name email')
            .populate('project', 'name')
            .populate('comments.user', 'name');
        if (!task) return res.status(404).json({ error: 'Not found' });

        // Staff can only view tasks assigned to them
        if (req.user.role !== 'admin') {
            if (!task.assignee || task.assignee._id.toString() !== req.user.id) {
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
        const { title, description, project, assignee, status, priority, dueDate, estimated, spent } = req.body;

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

        const task = await Task.create({
            title, description,
            project: project || null,
            assignee: assignee || null,
            status: status || 'todo',
            priority: priority || 'medium',
            dueDate: dueDate || null,
            estimated: estimated || 0,
            spent: spent || 0,
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
router.patch('/:id', requireAuth, requirePermission('tasks'), async (req, res) => {
    try {
        // Permission check: admin or task assignee/creator
        if (req.user.role !== 'admin') {
            const existing = await Task.findById(req.params.id);
            if (!existing) return res.status(404).json({ error: 'Not found' });
            if (existing.assignee && existing.assignee.toString() !== req.user.id &&
                existing.createdBy && existing.createdBy.toString() !== req.user.id) {
                return res.status(403).json({ error: 'You can only update your own tasks' });
            }
        }

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
router.delete('/:id', requireAuth, requirePermission('tasks'), async (req, res) => {
    try {
        // Permission check: admin or task assignee/creator
        if (req.user.role !== 'admin') {
            const existing = await Task.findById(req.params.id);
            if (!existing) return res.status(404).json({ error: 'Not found' });
            if (existing.assignee && existing.assignee.toString() !== req.user.id &&
                existing.createdBy && existing.createdBy.toString() !== req.user.id) {
                return res.status(403).json({ error: 'You can only delete your own tasks' });
            }
        }

        const task = await Task.findByIdAndDelete(req.params.id);
        if (!task) return res.status(404).json({ error: 'Not found' });
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

        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ error: 'Task not found' });

        task.comments.push({ user: req.user.id, text: text.trim() });
        await task.save();

        const updated = await Task.findById(req.params.id)
            .populate('assignee', 'name email')
            .populate('project', 'name')
            .populate('comments.user', 'name');
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete comment from task
router.delete('/:id/comments/:commentId', requireAuth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ error: 'Task not found' });

        const comment = task.comments.id(req.params.commentId);
        if (!comment) return res.status(404).json({ error: 'Comment not found' });

        // Only admin or comment author can delete
        if (req.user.role !== 'admin' && comment.user.toString() !== req.user.id) {
            return res.status(403).json({ error: 'You can only delete your own comments' });
        }

        task.comments.pull(req.params.commentId);
        await task.save();

        const updated = await Task.findById(req.params.id)
            .populate('assignee', 'name email')
            .populate('project', 'name')
            .populate('comments.user', 'name');
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
