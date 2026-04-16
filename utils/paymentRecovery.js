const https        = require('https');
const supabase     = require('../lib/supabase');
const applicantsDb = require('../db/applicants');
const studentsDb   = require('../db/students');
const { createStudentFromApplicant } = require('./enrolStudent');

// Verify a Paystack transaction by reference
function verifyPaystack(reference) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.paystack.co',
      path: `/transaction/verify/${encodeURIComponent(reference)}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('Invalid Paystack response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Paystack timeout')); });
    req.end();
  });
}

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
      transactions = await searchPaystackTransactions(app.email);
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

    // Check if this reference was already processed
    const { data: dupRefs } = await supabase
      .from('payments').select('id').eq('reference', match.reference).limit(1);
    if (dupRefs && dupRefs.length) continue;

    // Check if student already exists
    const existingStudent = await studentsDb.findByEmail(app.email);
    if (existingStudent) continue;

    // Recover: mark paid and create student
    const plan = match.metadata.plan || app.pending_payment_plan || 'monthly';

    try {
      await applicantsDb.update(app.id, {
        application_fee_paid: true,
        application_fee_ref:  match.reference,
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
    }
  }

  if (recovered > 0) console.log(`Payment recovery: recovered ${recovered} payment(s)`);
}

// Search Paystack transactions by customer email
function searchPaystackTransactions(email) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ customer: email, status: 'success', perPage: '10' });
    const req = https.request({
      hostname: 'api.paystack.co',
      path: `/transaction?${params}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed.data || []);
        } catch { reject(new Error('Invalid Paystack response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Paystack timeout')); });
    req.end();
  });
}

module.exports = { runPaymentRecovery };
