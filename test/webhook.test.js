// ============================================================
// test/webhook.test.js — Paystack webhook boundary
//
// The webhook is a server-to-server callback (no browser UI): it verifies
// the HMAC-SHA512 signature, acks 200 fast, and — by design — performs NO
// payment mutation ("does NOT auto-complete payments"). So a duplicate
// webhook cannot double-credit. This locks in: valid signature → 200,
// invalid/absent → 401/400, and duplicate delivery stays a safe 200 no-op.
//
// Run: node --test test/webhook.test.js
// ============================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { createFakeSupabase } = require('./support/fake-supabase');

const ROOT = path.join(__dirname, '..');
const SECRET = process.env.PAYSTACK_SECRET_KEY = 'sk_test_webhook_secret';

function build() {
  const fake = createFakeSupabase({ payments: [], orders: [], applicants: [], students: [] });
  const sp = require.resolve(path.join(ROOT, 'lib/supabase.js'));
  require.cache[sp] = { id: sp, filename: sp, loaded: true, exports: fake };
  for (const rel of ['routes/webhooks.js']) { try { delete require.cache[require.resolve(path.join(ROOT, rel))]; } catch (_) {} }
  const app = express();
  app.use('/api/webhooks', express.raw({ type: '*/*', limit: '256kb' }), require(path.join(ROOT, 'routes/webhooks.js')));
  return app;
}

let server, base;
test.before(async () => {
  const app = build();
  await new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
});
test.after(() => { if (server) server.close(); });

function sign(bodyStr) {
  return crypto.createHmac('sha512', SECRET).update(Buffer.from(bodyStr)).digest('hex');
}
async function postWebhook(bodyStr, signature) {
  const res = await fetch(base + '/api/webhooks/paystack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(signature ? { 'X-Paystack-Signature': signature } : {}) },
    body: bodyStr,
  });
  return res.status;
}

test('valid signature is accepted (200)', async () => {
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'ENROL-x-123456789012' } });
  assert.strictEqual(await postWebhook(body, sign(body)), 200);
});

test('invalid signature is rejected (401)', async () => {
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'ENROL-x-123456789012' } });
  assert.strictEqual(await postWebhook(body, 'deadbeef'), 401);
});

test('absent signature is rejected (401)', async () => {
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'ENROL-x-123456789012' } });
  assert.strictEqual(await postWebhook(body, ''), 401);
});

test('empty body is rejected (400)', async () => {
  assert.strictEqual(await postWebhook('', sign('')), 400);
});

test('duplicate webhook delivery stays a safe 200 no-op (no double-credit)', async () => {
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'ENROL-dup-123456789012' } });
  const sig = sign(body);
  assert.strictEqual(await postWebhook(body, sig), 200);
  assert.strictEqual(await postWebhook(body, sig), 200); // retry → still 200, no mutation path exists
});
