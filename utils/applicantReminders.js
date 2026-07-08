const crypto   = require('crypto');
const supabase = require('../lib/supabase');
const { sendMail } = require('./mailer');
const { applicantPaymentReminderEmail, verificationEmail } = require('./emailTemplates');

// Send a reminder email to applicants who verified their email 48+ hours ago
// but haven't completed payment. Only sends once (payment_reminder_sent_at
// column - migration 016; the old notes tag was wiped by any admin note edit).
async function runApplicantPaymentReminders() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Find verified, unpaid applicants created more than 48h ago who haven't been reminded
  const { data: applicants, error } = await supabase
    .from('applicants')
    .select('id, full_name, email, track, notes, payment_reminder_sent_at')
    .eq('email_verified', true)
    .eq('application_fee_paid', false)
    .eq('status', 'Pending')
    .is('payment_reminder_sent_at', null)
    .lt('created_at', cutoff)
    .limit(50);

  if (error) throw error;

  const host = process.env.HOST || 'https://goallordcreativity.com';
  let sent = 0;

  for (const app of (applicants || [])) {
    const paymentUrl = `${host}/apply-payment.html?id=${app.id}`;

    try {
      await sendMail({
        to:      app.email,
        subject: `Don't lose your spot - Complete your Goallord Academy enrolment`,
        html:    applicantPaymentReminderEmail({ fullName: app.full_name, track: app.track, paymentUrl })
      });

      await supabase.from('applicants')
        .update({ payment_reminder_sent_at: new Date().toISOString() })
        .eq('id', app.id);
      sent++;
    } catch (e) {
      console.error(`Applicant reminder failed for ${app.email}:`, e.message);
    }
  }

  if (sent > 0) console.log(`Sent ${sent} applicant payment reminder(s)`);

  await runVerificationReminders(host);
}

// Nudge applicants who never verified their email (the original send may have
// failed entirely - they'd otherwise wait forever on an inbox that got
// nothing). Fresh token, sent once, 24h+ after application.
async function runVerificationReminders(host) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: applicants, error } = await supabase
    .from('applicants')
    .select('id, full_name, email')
    .eq('email_verified', false)
    .eq('status', 'Pending')
    .is('verify_reminder_sent_at', null)
    .lt('created_at', cutoff)
    .limit(50);

  if (error) throw error;

  let sent = 0;
  for (const app of (applicants || [])) {
    try {
      const token   = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await supabase.from('applicants').update({
        email_verify_token:      token,
        email_verify_expires:    expires.toISOString(),
        verify_reminder_sent_at: new Date().toISOString()
      }).eq('id', app.id);

      await sendMail({
        to:      app.email,
        subject: 'Verify your email - Goallord Creativity Academy',
        html:    verificationEmail({ fullName: app.full_name, verifyUrl: `${host}/api/applicants/verify/${token}` })
      });
      sent++;
    } catch (e) {
      console.error(`Verification reminder failed for ${app.email}:`, e.message);
    }
  }

  if (sent > 0) console.log(`Sent ${sent} verification reminder(s)`);
}

module.exports = { runApplicantPaymentReminders };
