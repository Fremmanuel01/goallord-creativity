// Secret-protected HTTP triggers for the scheduled reminder / generation jobs.
//
// Why this exists: on Render's free plan the web process spins down when idle,
// so the in-process node-cron schedules (server.js) can silently miss their
// window — e.g. a 6 AM class reminder when nobody visited the site overnight.
// An external scheduler (GitHub Actions / cron-job.org) hits these endpoints to
// wake the service and run the job reliably. Every job is idempotent (it dedupes
// on the notifications table or lecture status), so a double-trigger never
// double-sends. The in-process crons stay as a best-effort backup.
const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();

// Compose the daily maintenance checks the same way server.js does, so this
// endpoint and the in-process timer stay in sync.
async function runDailyChecks() {
  const { runOverdueCheck }              = require('./payments');
  const { runDeadlineReminders }         = require('./assignments');
  const { runApplicantPaymentReminders } = require('../utils/applicantReminders');
  const { runPaymentRecovery }           = require('../utils/paymentRecovery');
  const out = {};
  out.overdue   = await runOverdueCheck().catch(e => ({ error: e.message }));
  out.deadline  = await runDeadlineReminders().catch(e => ({ error: e.message }));
  out.applicant = await runApplicantPaymentReminders().catch(e => ({ error: e.message }));
  out.recovery  = await runPaymentRecovery().catch(e => ({ error: e.message }));
  return out;
}

const JOBS = {
  'class-reminders':     () => require('../utils/classReminders').runClassReminders(),
  'flashcard-day-after': () => require('../utils/flashcardAutoGen').runFlashcardDayAfterReminders(),
  'lecture-generation':  () => require('../utils/lectureGenerator').runLectureGeneration(),
  'daily-checks':        runDailyChecks,
};

// Constant-time comparison of the shared secret. Header only — a ?key=
// query param would leak the secret into access logs and proxies.
function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed when unconfigured
  const provided = req.get('x-cron-key') || '';
  const a = Buffer.from(String(provided));
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handle(req, res) {
  if (!process.env.CRON_SECRET) {
    return res.status(503).json({ error: 'CRON_SECRET is not configured on the server.' });
  }
  if (!authorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const job = req.params.job;
  const fn = JOBS[job];
  if (!fn) {
    return res.status(404).json({ error: `Unknown job "${job}". Valid jobs: ${Object.keys(JOBS).join(', ')}` });
  }
  try {
    const started = Date.now();
    const result = await fn();
    console.log(`[Cron] "${job}" ran via HTTP trigger:`, JSON.stringify(result));
    res.json({ ok: true, job, result, ms: Date.now() - started });
  } catch (err) {
    console.error(`[Cron] "${job}" failed:`, err.message);
    res.status(500).json({ ok: false, job, error: err.message });
  }
}

// GET and POST both work, so simple pingers (cron-job.org) and CI alike can use it.
router.get('/:job', handle);
router.post('/:job', handle);

module.exports = router;
