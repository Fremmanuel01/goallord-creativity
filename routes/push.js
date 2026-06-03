// ============================================================
// routes/push.js - Web Push subscription endpoints for the portal PWA.
//   GET  /api/push/vapid-public-key   public VAPID key for the client
//   POST /api/push/subscribe          { subscription } (auth: student/lecturer/admin)
//   POST /api/push/unsubscribe        { endpoint }
//   POST /api/push/test               send a test push to the caller
// ============================================================
const express = require('express');
const push    = require('../lib/push');
const pushDb  = require('../db/pushSubscriptions');
const { requireChatUser } = require('../middleware/chatAuth');

const router = express.Router();

// Public VAPID key - the browser needs it to create a subscription.
router.get('/vapid-public-key', (req, res) => {
  const key = push.publicKey();
  if (!key) return res.status(503).json({ error: 'Push not configured' });
  res.json({ publicKey: key });
});

// Register / refresh a subscription for the authenticated user.
router.post('/subscribe', requireChatUser, async (req, res) => {
  try {
    const sub = req.body && req.body.subscription;
    if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    await pushDb.upsert(req.chatUser, sub);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove a subscription (logout / disable notifications).
router.post('/unsubscribe', async (req, res) => {
  try {
    const endpoint = req.body && req.body.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    await pushDb.removeByEndpoint(endpoint);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send a test push to the authenticated user (for verifying setup).
router.post('/test', requireChatUser, async (req, res) => {
  try {
    await push.sendToUser(req.chatUser.id, {
      title: 'Goallord Portal',
      body:  'Notifications are working 🎉',
      url:   '/portal.html',
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
