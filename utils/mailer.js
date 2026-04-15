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

module.exports = { sendMail };
