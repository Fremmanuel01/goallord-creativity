/* Goallord Creativity — Webhooks
 *
 * Paystack webhook receiver.
 *
 * Security: every incoming request is validated against the
 * X-Paystack-Signature header (HMAC-SHA512 of the raw body using
 * PAYSTACK_SECRET_KEY). Signature comparison is timing-safe.
 *
 * Idempotency: Paystack will retry the same event multiple times.
 * We look up the event's reference in the existing tables (payments,
 * orders, applicants). If we already recorded that reference, we ack
 * with 200 immediately — no duplicate side effects.
 *
 * Action: this route does NOT auto-complete payments. Its job here is to
 *  - verify Paystack signature,
 *  - return 200 fast so Paystack stops retrying,
 *  - log loudly and notify ops when a reference is unknown to the system
 *    (meaning the client-side verify call probably never reached us).
 * A future PR can enhance this to auto-finalize unknown references.
 *
 * Mount in server.js BEFORE express.json() and BEFORE the CSRF middleware
 * using `express.raw({ type: 'application/json' })` or `type: 'star/star'`
 * so the raw body is preserved for HMAC verification.
 */

'use strict';

const express = require('express');
const crypto  = require('crypto');

const router = express.Router();

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch (_) {
    return false;
  }
}

// POST /api/webhooks/paystack
router.post('/paystack', async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error('[webhook] PAYSTACK_SECRET_KEY is not set; refusing webhook.');
    return res.status(500).send('Server misconfigured');
  }

  // express.raw() gives us req.body as a Buffer.
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  if (!raw.length) return res.status(400).send('Empty body');

  const expected = crypto.createHmac('sha512', secret).update(raw).digest('hex');
  const provided = req.headers['x-paystack-signature'] || '';

  if (!timingSafeEqualHex(expected, provided)) {
    // Don't leak any detail. Always 401.
    console.warn('[webhook] Paystack signature mismatch from', req.ip);
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    console.error('[webhook] Paystack body not JSON:', err.message);
    return res.status(400).send('Invalid JSON');
  }

  // ACK immediately, do the lookup async so Paystack never waits on us.
  res.status(200).send('ok');

  setImmediate(() => handlePaystackEvent(event).catch((err) => {
    console.error('[webhook] handler failed:', err && err.message ? err.message : err);
  }));
});

async function handlePaystackEvent(event) {
  const type = event && event.event;
  const data = (event && event.data) || {};
  const reference = data.reference;

  if (!reference) {
    console.warn('[webhook] event has no reference', { type });
    return;
  }
  if (type !== 'charge.success') {
    // We currently only care about successful charges. Other events
    // (transfer.success, refund.processed, etc.) are accepted but ignored.
    console.log('[webhook] ignoring event', { type, reference });
    return;
  }

  // Idempotency: if any of our tables already know this reference, exit.
  const known = await isReferenceKnown(reference);
  if (known) {
    console.log('[webhook] reference already processed', { reference, where: known });
    return;
  }

  // Unknown reference. Log loudly so ops can reconcile. We deliberately do
  // NOT auto-create payment / order / student records here — the enrollment
  // and order flows have side effects (emails, downloads, accounts created)
  // that are safer to handle through their dedicated endpoints. Track this
  // as a follow-up backlog item.
  const meta = data.metadata || {};
  console.warn(
    '[webhook] unrecognised charge.success — possible failed client-side verify',
    {
      reference,
      amount: data.amount,
      currency: data.currency,
      email: data.customer && data.customer.email,
      paidAt: data.paid_at,
      metadata: meta
    }
  );
}

async function isReferenceKnown(reference) {
  const supabase = require('../lib/supabase');
  try {
    const { data: payRows } = await supabase
      .from('payments').select('id').eq('reference', reference).limit(1);
    if (payRows && payRows.length) return 'payments';
  } catch (_) {}

  try {
    const { data: orderRows } = await supabase
      .from('orders').select('id').eq('paystack_reference', reference).limit(1);
    if (orderRows && orderRows.length) return 'orders';
  } catch (_) {}

  try {
    const { data: appRows } = await supabase
      .from('applicants').select('id').eq('application_fee_ref', reference).limit(1);
    if (appRows && appRows.length) return 'applicants';
  } catch (_) {}

  return null;
}

module.exports = router;
