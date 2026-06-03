// ============================================================
// lib/push.js - Web Push (VAPID) sender for the Goallord Portal PWA.
//
// Configured from env:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https URL)
//
// sendToUser(userId, payload) fans a notification out to every push
// subscription registered for that user, pruning subscriptions the
// push service reports as gone (404/410). Failures are swallowed -
// push is best-effort and must never break the request that triggered it.
// ============================================================
const webpush = require('web-push');

const PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@goallordcreativity.com';

let configured = false;
if (PUBLIC && PRIVATE) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
    configured = true;
  } catch (err) {
    console.error('[push] Failed to configure VAPID:', err.message);
  }
} else {
  console.warn('[push] VAPID keys not set - push notifications disabled.');
}

function isConfigured() {
  return configured;
}

function publicKey() {
  return PUBLIC || null;
}

// Send to a single subscription object. Returns true on success,
// false if the subscription is dead and should be removed.
async function sendToSubscription(sub, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return true;
  } catch (err) {
    // 404 / 410 → subscription is permanently gone.
    if (err.statusCode === 404 || err.statusCode === 410) return false;
    console.error('[push] send error:', err.statusCode || err.message);
    return true; // transient - keep the subscription
  }
}

// Fan a payload out to all of a user's subscriptions.
// Lazily required db avoids a circular import (db -> push -> db).
async function sendToUser(userId, payload) {
  if (!configured || !userId) return;
  let pushDb;
  try {
    pushDb = require('../db/pushSubscriptions');
  } catch {
    return;
  }
  let subs = [];
  try {
    subs = await pushDb.findByUser(userId);
  } catch (err) {
    console.error('[push] could not load subscriptions:', err.message);
    return;
  }
  if (!subs.length) return;

  const dead = [];
  await Promise.all(subs.map(async (sub) => {
    const alive = await sendToSubscription(sub, payload);
    if (!alive) dead.push(sub.endpoint);
  }));

  if (dead.length) {
    await Promise.all(dead.map((ep) => pushDb.removeByEndpoint(ep).catch(() => {})));
  }
}

module.exports = { isConfigured, publicKey, sendToUser };
