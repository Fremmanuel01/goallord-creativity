const https = require('https');

async function sendMail({ to, subject, html }) {
  // Fail loud on misconfig so "stuck at unverified" stops being a silent mystery.
  if (!process.env.BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY is not set. Cannot send email.');
  }
  if (!process.env.EMAIL_FROM) {
    throw new Error('EMAIL_FROM is not set. Brevo requires a verified sender address.');
  }
  if (!to) {
    throw new Error('sendMail called with no recipient.');
  }

  const payload = JSON.stringify({
    sender:   { name: 'Goallord Creativity', email: process.env.EMAIL_FROM },
    to:       [{ email: to }],
    subject,
    htmlContent: html
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.brevo.com',
      path:     '/v3/smtp/email',
      method:   'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'api-key':       process.env.BREVO_API_KEY,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`Brevo API error ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Ops alert to the admin inbox (EMAIL_FROM). Never throws - alerting must not
// break the flow it is reporting on; failures are logged instead.
async function notifyAdmin({ subject, heading, intro, infoRows = [] }) {
  try {
    const { corporateEmail } = require('./emailTemplates');
    const host = process.env.HOST || 'https://goallordcreativity.com';
    await sendMail({
      to: process.env.EMAIL_FROM,
      subject,
      html: corporateEmail({
        eyebrow: 'Admin Alert',
        heading, intro, infoRows,
        ctaLabel: 'Open Dashboard',
        ctaUrl:  host + '/dashboard.html',
        logoUrl: host + '/assets/images/logo/goallord-logo.png',
        preheader: heading
      })
    });
    return true;
  } catch (e) {
    console.error('notifyAdmin failed:', subject, '-', e.message);
    return false;
  }
}

module.exports = { sendMail, notifyAdmin };
