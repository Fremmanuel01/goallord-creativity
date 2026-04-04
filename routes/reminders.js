const router      = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const remindersDb = require('../db/reminders');
const supabase    = require('../lib/supabase');
const { sendTaskReminders, restartCron } = require('../utils/taskReminders');

// GET /api/reminders/settings
router.get('/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const settings = await remindersDb.getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/reminders/settings
router.put('/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { frequency, enabled, sendTime } = req.body;
    const updates = {};
    if (frequency !== undefined) updates.frequency  = frequency;
    if (enabled !== undefined)   updates.enabled    = enabled;
    if (sendTime !== undefined)  updates.send_time  = sendTime;
    const settings = await remindersDb.updateSettings(updates);

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

    const { data: logs, count: total, error } = await supabase
      .from('reminder_logs')
      .select('*', { count: 'exact' })
      .order('sent_at', { ascending: false })
      .range(skip, skip + limit - 1);
    if (error) throw error;

    res.json({ logs: logs || [], total: total || 0, page, pages: Math.ceil((total || 0) / limit) });
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
    const todayISO = todayStart.toISOString();

    const [totalSentResult, sentTodayResult, uniqueResult, failedResult] = await Promise.all([
      supabase.from('reminder_logs').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
      supabase.from('reminder_logs').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', todayISO),
      supabase.from('reminder_logs').select('recipient').eq('status', 'sent'),
      supabase.from('reminder_logs').select('id', { count: 'exact', head: true }).eq('status', 'failed')
    ]);

    const totalSent = totalSentResult.count || 0;
    const sentToday = sentTodayResult.count || 0;
    const failedCount = failedResult.count || 0;

    // Count unique recipients
    const recipients = new Set((uniqueResult.data || []).map(r => r.recipient));
    const uniqueRecipients = recipients.size;

    res.json({ totalSent, sentToday, uniqueRecipients, failedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
