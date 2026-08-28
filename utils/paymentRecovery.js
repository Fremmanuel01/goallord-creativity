const supabase     = require('../lib/supabase');
const applicantsDb = require('../db/applicants');
const studentsDb   = require('../db/students');
const config       = require('../lib/config');
const { searchTransactions } = require('../lib/paystack');
const { createStudentFromApplicant } = require('./enrolStudent');
const { notifyAdmin } = require('./mailer');

// Finds applicants who verified email but haven't paid, and checks Paystack
// for successful transactions that were never finalized (browser closed, etc.)
async function runPaymentRecovery() {
  if (!process.env.PAYSTACK_SECRET_KEY) return;

  // Find verified, unpaid applicants from the last 7 days
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: applicants, error } = await supabase
    .from('applicants')
    .select('id, full_name, email, track, application_fee_ref, pending_payment_plan')
    .eq('email_verified', true)
    .eq('application_fee_paid', false)
    .gt('created_at', cutoff)
    .limit(20);

  if (error) throw error;
  if (!applicants || !applicants.length) return;

  let recovered = 0;

  for (const app of applicants) {
    // Try to find a successful Paystack transaction for this applicant
    // by checking recent transactions with the ENROL- prefix pattern
    const ref = `ENROL-${app.id}-`;

    // Search Paystack transactions list for this applicant's reference prefix
    let transactions;
    try {
      transactions = await searchTransactions(app.email);
    } catch (e) {
      console.error(`Payment recovery: failed to search for ${app.email}:`, e.message);
      continue;
    }

    if (!transactions || !transactions.length) continue;

    // Find a successful transaction that matches this applicant
    const match = transactions.find(tx =>
      tx.status === 'success' &&
      tx.reference && tx.reference.startsWith(ref) &&
      tx.metadata && (tx.metadata.applicantId === app.id || tx.metadata.applicant_id === app.id)
    );

    if (!match) continue;

    // The reference and metadata are constructed CLIENT-SIDE with the public
    // key, so a success flag alone proves nothing about the amount. Require
    // the full expected total in NGN before auto-enrolling.
    const plan = match.metadata.plan || app.pending_payment_plan || 'monthly';
    const expected = config.expectedEnrolmentTotal(plan);
    if (match.currency && match.currency !== 'NGN') {
      console.warn(`Payment recovery: skipping ${app.email} - currency ${match.currency}`);
      continue;
    }
    // Compare in integer kobo to avoid float rounding on the money path.
    if (match.amount < expected * 100) {
      console.warn(`Payment recovery: skipping ${app.email} - paid ${match.amount / 100}, expected ${expected}`);
      await notifyAdmin({
        subject: `Underpaid enrolment transaction: ${app.full_name}`,
        heading: 'Successful charge below the expected total',
        intro:   `A successful Paystack charge exists for <strong>${app.full_name}</strong> but the amount is below the expected enrolment total, so they were NOT auto-enrolled. Please review.`,
        infoRows: [
          { label: 'Applicant', value: app.full_name },
          { label: 'Email', value: app.email },
          { label: 'Reference', value: match.reference },
          { label: 'Paid', value: '₦' + (match.amount / 100).toLocaleString() },
          { label: 'Expected', value: '₦' + expected.toLocaleString() }
        ]
      });
      continue;
    }

    // Check if this reference was already processed
    const { data: dupRefs } = await supabase
      .from('payments').select('id').eq('reference', match.reference).limit(1);
    if (dupRefs && dupRefs.length) continue;

    // Check if student already exists
    const existingStudent = await studentsDb.findByEmail(app.email);
    if (existingStudent) continue;

    // Recover: mark paid and create student
    try {
      await applicantsDb.update(app.id, {
        application_fee_paid: true,
        application_fee_ref:  match.reference,
        pending_payment_plan: plan,
        status:               'Accepted'
      });

      await createStudentFromApplicant(app, plan, {
        tuitionPaid: true,
        reference:   match.reference,
        method:      'Paystack'
      });

      recovered++;
      console.log(`Payment recovery: enrolled ${app.email} (ref: ${match.reference})`);
    } catch (e) {
      console.error(`Payment recovery: failed to enrol ${app.email}:`, e.message);
      await notifyAdmin({
        subject: `URGENT: paid applicant has no student account - ${app.full_name}`,
        heading: 'Recovery enrolment failed',
        intro:   `<strong>${app.full_name}</strong> has a verified Paystack payment but their student account could not be created (${e.message}). The orphan sweep will retry on the next run.`,
        infoRows: [
          { label: 'Applicant', value: app.full_name },
          { label: 'Email', value: app.email },
          { label: 'Reference', value: match.reference }
        ]
      });
    }
  }

  if (recovered > 0) console.log(`Payment recovery: recovered ${recovered} payment(s)`);

  // Second sweep: applicants flagged paid whose student account was never
  // created (a previous pay-application / confirm-fee / recovery run failed
  // between the flag update and student creation). Without this, that state
  // is permanent - the applicant is locked out of the payment page and the
  // main sweep above skips them (it only scans application_fee_paid=false).
  await runOrphanedEnrolments();
}

// Enrol applicants who are marked paid but have no student account.
// Only status='Accepted' is considered: deleting a student sets the linked
// applicant to 'Rejected', which keeps deliberate deletions out of this sweep.
async function runOrphanedEnrolments() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: paid, error } = await supabase
    .from('applicants')
    .select('*')
    .eq('application_fee_paid', true)
    .eq('status', 'Accepted')
    .gt('created_at', cutoff)
    .limit(50);
  if (error) throw error;

  for (const app of (paid || [])) {
    const existing = await studentsDb.findByEmail(app.email);
    if (existing) continue; // normal case - account exists

    const plan   = app.pending_payment_plan || 'monthly';
    const isCash = String(app.application_fee_ref || '').startsWith('CASH-');
    try {
      const student = await createStudentFromApplicant(app, plan, {
        tuitionPaid: true,
        reference:   app.application_fee_ref || '',
        method:      isCash ? 'Cash' : (String(app.application_fee_ref || '').startsWith('ENROL-') ? 'Paystack' : 'Bank Transfer')
      });
      console.log(`Orphan sweep: enrolled ${app.email}`);
      await notifyAdmin({
        subject: `Recovered: student account created for ${app.full_name}`,
        heading: 'Orphaned paid applicant enrolled',
        intro:   `<strong>${app.full_name}</strong> had paid but had no student account. The sweep has now created it${student._acceptanceEmailSent === false ? ', but the login-details email FAILED - please resend their credentials' : ' and emailed their login details'}.`,
        infoRows: [
          { label: 'Applicant', value: app.full_name },
          { label: 'Email', value: app.email },
          { label: 'Reference', value: app.application_fee_ref || '' }
        ]
      });
    } catch (e) {
      console.error(`Orphan sweep: failed to enrol ${app.email}:`, e.message);
      await notifyAdmin({
        subject: `URGENT: paid applicant has no student account - ${app.full_name}`,
        heading: 'Orphan sweep enrolment failed',
        intro:   `<strong>${app.full_name}</strong> is marked as paid but their student account could not be created (${e.message}). Manual intervention needed.`,
        infoRows: [
          { label: 'Applicant', value: app.full_name },
          { label: 'Email', value: app.email },
          { label: 'Reference', value: app.application_fee_ref || '' }
        ]
      });
    }
  }
}

module.exports = { runPaymentRecovery, runOrphanedEnrolments };
