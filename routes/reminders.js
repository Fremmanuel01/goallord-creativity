const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const ReminderSettings = require('../models/ReminderSettings');
const ReminderLog = require('../models/ReminderLog');
const { sendTaskReminders, restartCron } = require('../utils/taskReminders');

// GET /api/reminders/settings
router.get('/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const settings = await ReminderSettings.get();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/reminders/settings
router.put('/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { frequency, enabled, sendTime } = req.body;
    let settings = await ReminderSettings.get();
    if (frequency !== undefined) settings.frequency = frequency;
    if (enabled !== undefined)   settings.enabled = enabled;
    if (sendTime !== undefined)  settings.sendTime = sendTime;
    await settings.save();

    // Reschedule cron with new settings
    restartCron(settings);

    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reminders/logs
router.get('/logs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip  = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      ReminderLog.find().sort({ sentAt: -1 }).skip(skip).limit(limit),
      ReminderLog.countDocuments()
    ]);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reminders/send — manual trigger
router.post('/send', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await sendTaskReminders();
    res.json({ message: 'Reminders sent', sent: result.sent, total: result.total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reminders/stats
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalSent, sentToday, uniqueRecipients, failedCount] = await Promise.all([
      ReminderLog.countDocuments({ status: 'sent' }),
      ReminderLog.countDocuments({ status: 'sent', sentAt: { $gte: todayStart } }),
      ReminderLog.distinct('recipient').then(r => r.length),
      ReminderLog.countDocuments({ status: 'failed' })
    ]);

    res.json({ totalSent, sentToday, uniqueRecipients, failedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
