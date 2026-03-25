const cron = require('node-cron');
const { sendMail } = require('./mailer');
const Task = require('../models/Task');
const ReminderLog = require('../models/ReminderLog');
const ReminderSettings = require('../models/ReminderSettings');

let currentCronJob = null;

function daysUntil(date) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

function buildEmail(task, user, project) {
    const days = daysUntil(task.dueDate);
    const dueStr = new Date(task.dueDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0B0D10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:40px 20px">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px">
        <h1 style="color:#D66A1F;font-size:22px;font-weight:700;margin:0">GOALLORD</h1>
        <p style="color:#8892A4;font-size:12px;margin-top:4px;letter-spacing:1px">TASK REMINDER</p>
    </div>

    <!-- Card -->
    <div style="background:#171A21;border:1px solid #2A2F3A;border-radius:12px;overflow:hidden">
        <!-- Project bar -->
        <div style="height:4px;background:${projectColor}"></div>

        <div style="padding:28px 24px">
            <!-- Greeting -->
            <p style="color:#F4F6FA;font-size:16px;margin:0 0 20px">Hi ${user.name.split(' ')[0]},</p>

            <!-- Urgency badge -->
            <div style="display:inline-block;background:${urgencyColor}20;border:1px solid ${urgencyColor}40;border-radius:20px;padding:6px 14px;margin-bottom:20px">
                <span style="color:${urgencyColor};font-size:13px;font-weight:600">${urgencyText}</span>
            </div>

            <!-- Task details -->
            <div style="background:#0F1115;border:1px solid #2A2F3A;border-radius:8px;padding:18px 20px;margin-bottom:20px">
                <p style="color:#8892A4;font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin:0 0 8px">Task</p>
                <h2 style="color:#F4F6FA;font-size:18px;font-weight:600;margin:0 0 14px">${task.title}</h2>

                <div style="display:flex;gap:20px;flex-wrap:wrap">
                    <div>
                        <p style="color:#8892A4;font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin:0 0 4px">Project</p>
                        <p style="color:#F4F6FA;font-size:13px;margin:0">${projectName}</p>
                    </div>
                    <div>
                        <p style="color:#8892A4;font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin:0 0 4px">Due Date</p>
                        <p style="color:${urgencyColor};font-size:13px;font-weight:600;margin:0">${dueStr}</p>
                    </div>
                    <div>
                        <p style="color:#8892A4;font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin:0 0 4px">Priority</p>
                        <p style="margin:0"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${priorityColors[task.priority] || '#F59E0B'};margin-right:6px;vertical-align:middle"></span><span style="color:#F4F6FA;font-size:13px;vertical-align:middle">${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}</span></p>
                    </div>
                </div>
            </div>

            ${task.description ? `<p style="color:#8892A4;font-size:13px;margin:0 0 20px;line-height:1.5">${task.description}</p>` : ''}

            <!-- CTA -->
            <a href="https://goallordcreativity.com/dashboard.html" style="display:inline-block;background:#D66A1F;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px">Open Dashboard →</a>
        </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:24px">
        <p style="color:#8892A4;font-size:11px;margin:0">This is an automated reminder from Goallord Creativity.</p>
        <p style="color:#8892A4;font-size:11px;margin:4px 0 0">Complete your task to stop receiving these reminders.</p>
    </div>
</div>
</body>
</html>`
    };
}

async function sendTaskReminders() {
    const result = { sent: 0, total: 0 };
    try {
        // Find all tasks that are NOT done and have a due date
        const tasks = await Task.find({
            status: { $ne: 'done' },
            dueDate: { $exists: true, $ne: null },
            assignee: { $exists: true, $ne: null }
        }).populate('assignee', 'name email').populate('project', 'name color');

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
                await ReminderLog.create({
                    task: task._id,
                    taskTitle: task.title,
                    recipient: task.assignee.email,
                    recipientName: task.assignee.name,
                    project: projectName,
                    status: 'sent'
                });
            } catch (err) {
                console.error(`[Reminders] Failed to send to ${task.assignee.email}:`, err.message);

                // Log failure
                await ReminderLog.create({
                    task: task._id,
                    taskTitle: task.title,
                    recipient: task.assignee.email,
                    recipientName: task.assignee.name,
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
    const time = settings.sendTime || '08:00';
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

    console.log(`[Reminders] Cron scheduled — every ${settings.frequency} days at ${settings.sendTime} WAT`);
}

async function startReminderCron() {
    try {
        const settings = await ReminderSettings.get();
        restartCron(settings);
    } catch (err) {
        console.error('[Reminders] Failed to load settings, using defaults:', err.message);
        restartCron({ frequency: 2, enabled: true, sendTime: '08:00' });
    }
}

module.exports = { startReminderCron, sendTaskReminders, restartCron };
