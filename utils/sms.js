// ============================================================
// utils/sms.js - transactional SMS via Brevo
//
// Reuses the existing BREVO_API_KEY. Sender label comes from
// BREVO_SMS_SENDER (alphanumeric, ≤11 chars, e.g. "Goallord").
// If SMS isn't configured or no phone is given, this no-ops and
// returns { sent:false, reason } instead of throwing - SMS is a
// best-effort nicety layered on top of email, never a hard
// dependency in a payment path.
// ============================================================
const https = require('https');

// Normalise a Nigerian phone number to E.164 (+234…).
// Accepts 080…, 23480…, +23480…, returns null if unusable.
function normalizePhone(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/[\s()-]/g, '');
  if (s.startsWith('+')) return /^\+\d{8,15}$/.test(s) ? s : null;
  s = s.replace(/\D/g, '');
  if (s.startsWith('234')) s = '+' + s;
  else if (s.startsWith('0')) s = '+234' + s.slice(1);
  else if (s.length === 10) s = '+234' + s;          // 8012345678
  else s = '+' + s;
  return /^\+\d{8,15}$/.test(s) ? s : null;
}

async function sendSms({ to, text }) {
  const sender = process.env.BREVO_SMS_SENDER;
  if (!process.env.BREVO_API_KEY || !sender) {
    console.warn('[sms] not configured (need BREVO_API_KEY + BREVO_SMS_SENDER); skipping.');
    return { sent: false, reason: 'not_configured' };
  }
  const recipient = normalizePhone(to);
  if (!recipient) {
    console.warn('[sms] no usable phone number; skipping.');
    return { sent: false, reason: 'no_phone' };
  }

  const payload = JSON.stringify({
    type: 'transactional',
    sender: String(sender).slice(0, 11),
    recipient,
    content: String(text || '').slice(0, 612)
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.brevo.com',
      path: '/v3/transactionalSMS/sms',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ sent: true });
        } else {
          console.error(`[sms] Brevo error ${res.statusCode}: ${body}`);
          resolve({ sent: false, reason: 'provider_error', status: res.statusCode });
        }
      });
    });
    req.on('error', (e) => { console.error('[sms] request failed:', e.message); resolve({ sent: false, reason: 'network' }); });
    req.write(payload);
    req.end();
  });
}

module.exports = { sendSms, normalizePhone };
