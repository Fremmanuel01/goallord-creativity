// Shared Paystack helpers. The verify logic was previously copy-pasted in
// routes/applicants.js, routes/payments.js, routes/orders.js and
// utils/paymentRecovery.js - three of the four copies had NO request timeout,
// so a hung Paystack connection could stall a request indefinitely. This
// single implementation always applies a timeout.
const https = require('https');
const supabase = require('./supabase');

function request(path) {
  return new Promise((resolve, reject) => {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return reject(new Error('PAYSTACK_SECRET_KEY is not set'));
    }
    const req = https.request({
      hostname: 'api.paystack.co',
      path,
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
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Paystack request timed out')); });
    req.end();
  });
}

// Verify a single transaction by reference. Returns the parsed Paystack body.
function verifyTransaction(reference) {
  return request(`/transaction/verify/${encodeURIComponent(reference)}`);
}

// List a customer's successful transactions (used by the recovery sweep).
async function searchTransactions(email) {
  const params = new URLSearchParams({ customer: email, status: 'success', perPage: '10' });
  const parsed = await request(`/transaction?${params}`);
  return parsed.data || [];
}

// True if a Paystack reference has already been consumed by a payment row or a
// shop order. Prevents cross-flow replay (e.g. a shop-order reference settling
// a tuition row). Pass excludePaymentId to ignore the row being settled.
async function isReferenceUsed(reference, excludePaymentId = null) {
  let payQ = supabase.from('payments').select('id').eq('reference', reference);
  if (excludePaymentId) payQ = payQ.neq('id', excludePaymentId);
  const { data: payRows } = await payQ.limit(1);
  if (payRows && payRows.length) return true;

  const { data: orderRows } = await supabase
    .from('orders').select('id').eq('paystack_reference', reference).limit(1);
  return !!(orderRows && orderRows.length);
}

module.exports = { verifyTransaction, searchTransactions, isReferenceUsed };
