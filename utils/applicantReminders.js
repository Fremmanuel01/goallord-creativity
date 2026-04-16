const supabase = require('../lib/supabase');
const { sendMail } = require('./mailer');
const { applicantPaymentReminderEmail } = require('./emailTemplates');

// Send a reminder email to applicants who verified their email 48+ hours ago
// but haven't completed payment. Only sends once (sets notes to track it).
async function runApplicantPaymentReminders() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Find verified, unpaid applicants created more than 48h ago who haven't been reminded
  const { data: applicants, error } = await supabase
    .from('applicants')
    .select('id, full_name, email, track, notes')
    .eq('email_verified', true)
    .eq('application_fee_paid', false)
    .eq('status', 'Pending')
    .lt('created_at', cutoff)
    .limit(50);

  if (error) throw error;
  if (!applicants || !applicants.length) return;

  const host = process.env.HOST || 'https://goallordcreativity.com';
  let sent = 0;

  for (const app of applicants) {
    // Skip if already reminded (we tag the notes field)
    if (app.notes && app.notes.includes('[payment-reminder-sent]')) continue;

    const paymentUrl = `${host}/apply-payment.html?id=${app.id}`;

    try {
      await sendMail({
        to:      app.email,
        subject: `Don't lose your spot — Complete your Goallord Academy enrolment`,
        html:    applicantPaymentReminderEmail({ fullName: app.full_name, track: app.track, paymentUrl })
      });

      // Mark as reminded so we don't send again
      const newNotes = (app.notes || '') + ' [payment-reminder-sent]';
      await supabase.from('applicants').update({ notes: newNotes.trim() }).eq('id', app.id);
      sent++;
    } catch (e) {
      console.error(`Applicant reminder failed for ${app.email}:`, e.message);
    }
  }

  if (sent > 0) console.log(`Sent ${sent} applicant payment reminder(s)`);
}

module.exports = { runApplicantPaymentReminders };
