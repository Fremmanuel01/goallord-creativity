const bcrypt       = require('bcryptjs');
const studentsDb   = require('../db/students');
const batchesDb    = require('../db/batches');
const paymentsDb   = require('../db/payments');
const { sendMail } = require('./mailer');
const { acceptanceEmail, adminAcceptanceNotificationEmail } = require('./emailTemplates');

const TRACK_DURATION = {
  'AI Software Development': '12 Weeks',
  'UI/UX':                   '12 Weeks',
  'WordPress':               '12 Weeks',
  'AI App Development':      '12 Weeks',
  'Videography':             '12 Weeks',
  'Other':                   '12 Weeks'
};

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = 'Gl' + new Date().getFullYear();
  for (let i = 0; i < 6; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

// opts.reference    – payment reference string
// opts.method       – 'Paystack' | 'Bank Transfer' | 'Admin'
// opts.tuitionPaid  – true = mark tuition as paid in same transaction
async function createStudentFromApplicant(applicant, paymentPlan, opts = {}) {
  const plainPassword = generatePassword();
  const hashed        = await bcrypt.hash(plainPassword, 12);
  const activeBatch   = await batchesDb.findActive();
  const method        = opts.method    || (applicant.application_fee_ref ? 'Bank Transfer' : 'Paystack');
  const reference     = opts.reference || applicant.application_fee_ref || '';

  const student = await studentsDb.create({
    full_name:           applicant.full_name,
    email:               applicant.email,
    password:            hashed,
    phone:               applicant.phone || '',
    track:               applicant.track || 'Other',
    batch_id:            activeBatch ? activeBatch.id : null,
    status:              'Active',
    applicant_ref:       applicant.id,
    application_fee_paid: true,
    payment_plan:        paymentPlan === 'full' ? 'full_upfront' : 'monthly',
    profile_picture:     applicant.profile_photo || ''
  });

  const host     = process.env.HOST || 'https://goallordcreativity.com';
  const loginUrl = `${host}/student-login.html`;
  const duration = TRACK_DURATION[applicant.track] || '12 Weeks';

  let acceptanceEmailSent = true;
  try {
    await sendMail({
      to:      applicant.email,
      subject: `Welcome to Goallord Creativity Academy — Your Login Details`,
      html:    acceptanceEmail({ fullName: applicant.full_name, track: applicant.track || 'Other', duration, email: applicant.email, password: plainPassword, loginUrl })
    });
  } catch (e) {
    acceptanceEmailSent = false;
    console.error('Acceptance email failed:', e.message);
    try {
      await require('../lib/supabase').from('email_failures').insert({
        to_email: applicant.email, kind: 'acceptance', student_id: student.id,
        error: e.message, payload: { password: plainPassword, loginUrl }
      });
    } catch {}
  }
  student._acceptanceEmailSent = acceptanceEmailSent;
  student._plainPassword = plainPassword;

  const appFee     = Number(process.env.APPLICATION_FEE)     || 20000;
  const fullFee    = Number(process.env.FULL_TUITION_FEE)    || 300000;
  const monthlyFee = Number(process.env.MONTHLY_TUITION_FEE) || 100000;
  const now = new Date();

  const safeInsert = async (row, label) => {
    try {
      await paymentsDb.create(row);
    } catch (e) {
      console.error(`Payment row insert failed (${label}):`, e.message);
    }
  };

  await safeInsert({
    student_id:  student.id,
    batch_id:    activeBatch ? activeBatch.id : null,
    category:    'application_fee',
    amount_due:  appFee,
    amount_paid: appFee,
    method, reference,
    recorded_by: 'System',
    paid_at:     new Date().toISOString()
  }, 'application_fee');

  if (paymentPlan === 'full') {
    await safeInsert({
      student_id: student.id, batch_id: activeBatch ? activeBatch.id : null,
      category: 'full_tuition_payment', amount_due: fullFee,
      amount_paid: opts.tuitionPaid ? fullFee : 0,
      method:    opts.tuitionPaid ? method : '',
      reference: opts.tuitionPaid ? reference : '',
      paid_at:   opts.tuitionPaid ? new Date().toISOString() : null,
      due_date:  new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
      recorded_by: 'System'
    }, 'full_tuition_payment');
  } else {
    for (let i = 1; i <= 3; i++) {
      const isFirst = i === 1;
      await safeInsert({
        student_id: student.id, batch_id: activeBatch ? activeBatch.id : null,
        category: `tuition_month_${i}`, amount_due: monthlyFee,
        amount_paid: (opts.tuitionPaid && isFirst) ? monthlyFee : 0,
        method:    (opts.tuitionPaid && isFirst) ? method : '',
        reference: (opts.tuitionPaid && isFirst) ? reference : '',
        paid_at:   (opts.tuitionPaid && isFirst) ? new Date().toISOString() : null,
        due_date:  new Date(now.getFullYear(), now.getMonth() + i, 1).toISOString(),
        recorded_by: 'System'
      }, `tuition_month_${i}`);
    }
  }

  await sendMail({
    to:      process.env.EMAIL_FROM,
    subject: `New Student Enrolled: ${applicant.full_name} — ${applicant.track || 'Other'}`,
    html:    adminAcceptanceNotificationEmail({ fullName: applicant.full_name, email: applicant.email, track: applicant.track || 'Other', studentId: student.id.toString(), dashboardUrl: `${host}/dashboard.html` })
  }).catch(e => console.error('Admin notification failed:', e.message));

  return student;
}

module.exports = { createStudentFromApplicant, generatePassword, TRACK_DURATION };
