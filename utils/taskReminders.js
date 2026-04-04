const cron = require('node-cron');
const { sendMail } = require('./mailer');
const tasksDb = require('../db/tasks');
const remindersDb = require('../db/reminders');

let currentCronJob = null;

function daysUntil(date) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

function buildEmail(task, user, project) {
    const days = daysUntil(task.due_date);
    const dueStr = new Date(task.due_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const isOverdue = days < 0;
    const isToday = days === 0;

    let urgencyText, urgencyColor;
    if (isOverdue) {
        urgencyText = `${Math.abs(days)} day${Math.abs(days) > 1 ? 's' : ''} overdue`;
        urgencyColor = '#EF4444';
    } else if (isToday) {
        urgencyText = 'Due today';
        urgencyColor = '#F59E0B';
    } else {
        urgencyText = `${days} day${days > 1 ? 's' : ''} remaining`;
        urgencyColor = days <= 3 ? '#F59E0B' : '#22C55E';
    }

    const priorityColors = { low: '#8892A4', medium: '#F59E0B', high: '#EF4444', urgent: '#DC2626' };
    const projectName = project?.name || 'Unassigned Project';
    const projectColor = project?.color || '#D66A1F';

    return {
        subject: isOverdue
            ? `⚠️ Overdue: "${task.title}" — ${Math.abs(days)} days past deadline`
            : isToday
                ? `⏰ Due Today: "${task.title}"`
                : `📋 Reminder: "${task.title}" — ${days} days left`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#080a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:0">

  <!-- Top accent bar -->
  <div style="height:4px;background:linear-gradient(90deg,${projectColor},${urgencyColor},${projectColor})"></div>

  <!-- Header -->
  <div style="background:#0d1017;padding:32px 32px 0;text-align:center">
    <div style="display:inline-block;background:${urgencyColor}15;border:1px solid ${urgencyColor}30;border-radius:50%;width:64px;height:64px;line-height:64px;text-align:center;margin-bottom:16px">
      <span style="font-size:26px">${isOverdue ? '&#9888;&#65039;' : isToday ? '&#9200;' : '&#128203;'}</span>
    </div>
    <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 6px;letter-spacing:-0.5px">Task Reminder</h1>
    <div style="display:inline-block;background:${urgencyColor}18;border:1px solid ${urgencyColor}35;border-radius:20px;padding:6px 16px;margin-top:8px">
      <span style="color:${urgencyColor};font-size:13px;font-weight:700;letter-spacing:0.3px">${urgencyText.toUpperCase()}</span>
    </div>
  </div>

  <!-- Body -->
  <div style="background:#0d1017;padding:28px 32px 36px">
    <p style="font-size:16px;line-height:1.7;color:#d1d5db;margin:0 0 24px">Hi <strong style="color:#fff">${user.name.split(' ')[0]}</strong>, you have a task that needs your attention.</p>

    <!-- Task card -->
    <div style="background:#141820;border:1px solid #1e2432;border-radius:12px;overflow:hidden;margin-bottom:24px">
      <div style="height:3px;background:${projectColor}"></div>
      <div style="padding:22px 24px">
        <h2 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 16px;letter-spacing:-0.3px">${task.title}</h2>

        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #1e2432;vertical-align:top;width:100px">
              <p style="color:#6b7280;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0">Project</p>
            </td>
            <td style="padding:10px 0;border-bottom:1px solid #1e2432;vertical-align:top">
              <p style="color:#fff;font-size:14px;font-weight:500;margin:0">${projectName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #1e2432;vertical-align:top">
              <p style="color:#6b7280;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0">Due Date</p>
            </td>
            <td style="padding:10px 0;border-bottom:1px solid #1e2432;vertical-align:top">
              <p style="color:${urgencyColor};font-size:14px;font-weight:700;margin:0">${dueStr}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 0;vertical-align:top">
              <p style="color:#6b7280;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0">Priority</p>
            </td>
            <td style="padding:10px 0;vertical-align:top">
              <span style="display:inline-block;background:${(priorityColors[task.priority] || '#F59E0B')}18;border:1px solid ${(priorityColors[task.priority] || '#F59E0B')}35;color:${priorityColors[task.priority] || '#F59E0B'};font-size:11px;font-weight:700;padding:3px 12px;border-radius:12px;text-transform:uppercase">${task.priority}</span>
            </td>
          </tr>
        </table>
      </div>
    </div>

    ${task.description ? `<p style="color:#9ca3af;font-size:14px;margin:0 0 24px;line-height:1.6;padding:14px 18px;background:#141820;border-radius:8px;border-left:3px solid #E8782A">${task.description}</p>` : ''}

    <!-- CTA Button -->
    <div style="text-align:center">
      <a href="https://goallordcreativity.com/login.html" style="display:inline-block;background:linear-gradient(135deg,#E8782A,#FF9F43);color:#fff;text-decoration:none;padding:14px 40px;border-radius:10px;font-weight:700;font-size:15px;letter-spacing:0.3px;box-shadow:0 4px 20px rgba(232,120,42,0.3)">Open Dashboard</a>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#080a0e;padding:20px 32px;text-align:center;border-top:1px solid #141820">
    <p style="margin:0 0 4px;font-size:11px;color:#4b5563">Complete your task to stop receiving these reminders.</p>
    <p style="margin:0;font-size:11px;color:#374151">Goallord Creativity Limited, Onitsha</p>
  </div>

</div>
</body></html>`
    };
}

async function sendTaskReminders() {
    const result = { sent: 0, total: 0 };
    try {
        // Find all tasks that are NOT done and have a due date and assignee
        const tasks = await tasksDb.findIncomplete({ notNull: ['due_date', 'assignee_id'] });

        result.total = tasks.length;

        if (!tasks.length) {
            console.log('[Reminders] No pending tasks with deadlines');
            return result;
        }

        for (const task of tasks) {
            if (!task.assignee || !task.assignee.email) continue;

            const { subject, html } = buildEmail(task, task.assignee, task.project);
            const projectName = task.project?.name || 'Unassigned';

            try {
                await sendMail({
                    to: task.assignee.email,
                    subject,
                    html
                });
                result.sent++;
                console.log(`[Reminders] Sent to ${task.assignee.email}: "${task.title}"`);

                // Log success
                await remindersDb.createLog({
                    task_id: task.id,
                    task_title: task.title,
                    recipient: task.assignee.email,
                    recipient_name: task.assignee.name,
                    project: projectName,
                    status: 'sent'
                });
            } catch (err) {
                console.error(`[Reminders] Failed to send to ${task.assignee.email}:`, err.message);

                // Log failure
                await remindersDb.createLog({
                    task_id: task.id,
                    task_title: task.title,
                    recipient: task.assignee.email,
                    recipient_name: task.assignee.name,
                    project: projectName,
                    status: 'failed',
                    error: err.message
                });
            }
        }
        console.log(`[Reminders] Done — ${result.sent}/${result.total} emails sent`);
    } catch (err) {
        console.error('[Reminders] Error:', err.message);
    }
    return result;
}

function buildCronExpression(settings) {
    const freq = settings.frequency || 2;
    const time = settings.send_time || '08:00';
    const [hour, minute] = time.split(':').map(Number);
    // "minute hour */freq * *"
    return `${minute} ${hour} */${freq} * *`;
}

function restartCron(settings) {
    if (currentCronJob) {
        currentCronJob.stop();
        currentCronJob = null;
        console.log('[Reminders] Previous cron stopped');
    }

    if (!settings || !settings.enabled) {
        console.log('[Reminders] Reminders disabled — cron not scheduled');
        return;
    }

    const expr = buildCronExpression(settings);
    currentCronJob = cron.schedule(expr, () => {
        console.log('[Reminders] Running scheduled task reminder...');
        sendTaskReminders();
    }, {
        timezone: 'Africa/Lagos'
    });

    console.log(`[Reminders] Cron scheduled — every ${settings.frequency} days at ${settings.send_time} WAT`);
}

async function startReminderCron() {
    try {
        const settings = await remindersDb.getSettings();
        restartCron(settings);
    } catch (err) {
        console.error('[Reminders] Failed to load settings, using defaults:', err.message);
        restartCron({ frequency: 2, enabled: true, send_time: '08:00' });
    }
}

module.exports = { startReminderCron, sendTaskReminders, restartCron };
