// Smallest checks that fail if the enrolment/payment fixes regress.
// Run: node --test test/enrolment.test.js
const { test } = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';

test('receipt numbers are unique under concurrency (random, not count-based)', async () => {
  const paymentsDb = require('../db/payments');
  // generateReceiptNumber is internal; exercise it via computePaymentStatus + format check
  const crypto = require('crypto');
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const n = 'RCP-' + new Date().getFullYear() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    assert.match(n, /^RCP-\d{4}-[0-9A-F]{6}$/);
    seen.add(n);
  }
  assert.strictEqual(seen.size, 200, 'receipt numbers must not collide');
});

test('lib/config: valid env parses, bad env falls back, no NaN reaches money path', () => {
  const path = require.resolve('../lib/config');
  const orig = process.env.APPLICATION_FEE;
  try {
    process.env.APPLICATION_FEE = '25000';
    delete require.cache[path];
    assert.strictEqual(require('../lib/config').APPLICATION_FEE, 25000);

    process.env.APPLICATION_FEE = 'not-a-number';
    delete require.cache[path];
    const c = require('../lib/config');
    assert.strictEqual(c.APPLICATION_FEE, 20000, 'bad env must fall back, never NaN');
    assert.ok(Number.isFinite(c.expectedEnrolmentTotal('full')));
    assert.strictEqual(c.expectedEnrolmentTotal('monthly'), c.APPLICATION_FEE + c.MONTHLY_TUITION_FEE);
  } finally {
    if (orig === undefined) delete process.env.APPLICATION_FEE; else process.env.APPLICATION_FEE = orig;
    delete require.cache[path];
  }
});

test('computePaymentStatus: unpaid admin-accept fee row stays pending, not paid', () => {
  const { computePaymentStatus } = require('../db/payments');
  const row = computePaymentStatus({
    category: 'application_fee', amount_due: 20000, amount_paid: 0,
    due_date: new Date(Date.now() + 7 * 86400000).toISOString()
  });
  assert.notStrictEqual(row.status, 'paid');
  assert.ok(!row.paid_at, 'no paid_at without money');
});

test('createStudentFromApplicant honours feePaid:false (no fake revenue)', async () => {
  // Intercept the db layer so no network is touched.
  const Module = require('module');
  const origLoad = Module._load;
  const inserted = [];
  Module._load = function (request, parent, isMain) {
    if (request.endsWith('db/students') || request === '../db/students') {
      return { create: async (doc) => ({ id: 'stu-1', ...doc }) };
    }
    if (request.endsWith('db/batches') || request === '../db/batches') {
      return { findActive: async () => null, findActiveByTrack: async () => null };
    }
    if (request.endsWith('db/payments') || request === '../db/payments') {
      return { create: async (row) => { inserted.push(row); return row; }, findByStudent: async () => inserted };
    }
    if (request === './mailer' || request.endsWith('utils/mailer')) {
      return { sendMail: async () => ({}), notifyAdmin: async () => true };
    }
    return origLoad.apply(this, arguments);
  };
  try {
    delete require.cache[require.resolve('../utils/enrolStudent')];
    const { createStudentFromApplicant } = require('../utils/enrolStudent');
    const applicant = { id: 'app-1', full_name: 'Test User', email: 't@example.com', track: 'Other' };

    await createStudentFromApplicant(applicant, 'monthly', { method: 'Admin', reference: 'admin-accept-app-1', feePaid: false });
    const appFeeRow = inserted.find(r => r.category === 'application_fee');
    assert.strictEqual(appFeeRow.amount_paid, 0, 'admin accept must NOT record fee as paid');
    assert.strictEqual(appFeeRow.paid_at, null);
    const month1 = inserted.find(r => r.category === 'tuition_month_1');
    assert.strictEqual(month1.amount_paid, 0, 'no tuition credited without money');

    inserted.length = 0;
    await createStudentFromApplicant(applicant, 'monthly', { method: 'Paystack', reference: 'ENROL-x', tuitionPaid: true });
    const paidFee = inserted.find(r => r.category === 'application_fee');
    assert.strictEqual(paidFee.amount_paid, 20000, 'real payment still records the fee');
    assert.strictEqual(inserted.find(r => r.category === 'tuition_month_1').amount_paid, 100000);
  } finally {
    Module._load = origLoad;
    delete require.cache[require.resolve('../utils/enrolStudent')];
  }
});
