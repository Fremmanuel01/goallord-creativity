function verificationEmail({ fullName, verifyUrl }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin:0;padding:0;background:#0F1115;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1115;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#171A21;border-radius:12px;border:1px solid #2A2F3A;overflow:hidden;max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background:#D66A1F;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:2px;">GOALLORD CREATIVITY</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:13px;letter-spacing:1px;">ACADEMY APPLICATION</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <h2 style="color:#F4F6FA;font-size:24px;margin:0 0 16px;">Verify Your Email Address</h2>
          <p style="color:#A0A6B3;font-size:15px;line-height:1.6;margin:0 0 12px;">Hi ${fullName},</p>
          <p style="color:#A0A6B3;font-size:15px;line-height:1.6;margin:0 0 32px;">
            Thank you for applying to Goallord Creativity Academy! To complete your application, please verify your email address by clicking the button below.
          </p>
          <div style="text-align:center;margin:0 0 32px;">
            <a href="${verifyUrl}" style="display:inline-block;background:#D66A1F;color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:6px;font-size:14px;font-weight:700;letter-spacing:1px;">VERIFY MY EMAIL</a>
          </div>
          <p style="color:#A0A6B3;font-size:13px;line-height:1.6;margin:0 0 8px;">
            Or copy and paste this link into your browser:
          </p>
          <p style="font-size:12px;word-break:break-all;margin:0 0 32px;">
            <a href="${verifyUrl}" style="color:#D66A1F;">${verifyUrl}</a>
          </p>
          <p style="color:#A0A6B3;font-size:13px;line-height:1.6;margin:0;border-top:1px solid #2A2F3A;padding-top:24px;">
            This link expires in 24 hours. If you did not submit an application, you can safely ignore this email.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 40px;border-top:1px solid #2A2F3A;text-align:center;">
          <p style="color:#A0A6B3;font-size:12px;margin:0;">Goallord Creativity Limited &bull; Onitsha, Nigeria</p>
          <p style="margin:4px 0 0;"><a href="mailto:admin@goallordcreativity.com" style="color:#D66A1F;font-size:12px;text-decoration:none;">admin@goallordcreativity.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function acceptanceEmail({ fullName, track, duration, email, password, loginUrl }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You've Been Accepted!</title>
</head>
<body style="margin:0;padding:0;background:#0F1115;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1115;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#171A21;border-radius:12px;border:1px solid #2A2F3A;overflow:hidden;max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background:#D66A1F;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:2px;">GOALLORD CREATIVITY</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:13px;letter-spacing:1px;">ACADEMY ACCEPTANCE</p>
        </td></tr>
        <!-- Congratulations Banner -->
        <tr><td style="background:#1E4BFF;padding:20px 40px;text-align:center;">
          <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:1px;">Congratulations — You've Been Accepted!</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <p style="color:#A0A6B3;font-size:15px;line-height:1.6;margin:0 0 12px;">Hi ${fullName},</p>
          <p style="color:#A0A6B3;font-size:15px;line-height:1.6;margin:0 0 24px;">
            We are thrilled to inform you that your application to Goallord Creativity Academy has been reviewed and <strong style="color:#F4F6FA;">accepted</strong>. Welcome to the programme!
          </p>

          <!-- Programme Details -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1115;border-radius:8px;border:1px solid #2A2F3A;margin:0 0 32px;">
            <tr><td style="padding:20px 24px;border-bottom:1px solid #2A2F3A;">
              <p style="margin:0;color:#A0A6B3;font-size:11px;letter-spacing:1px;">PROGRAMME DETAILS</p>
            </td></tr>
            <tr><td style="padding:20px 24px;">
              <table width="100%">
                <tr>
                  <td style="padding:6px 0;color:#A0A6B3;font-size:14px;width:140px;">Track:</td>
                  <td style="padding:6px 0;color:#F4F6FA;font-size:14px;font-weight:600;">${track}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#A0A6B3;font-size:14px;">Duration:</td>
                  <td style="padding:6px 0;color:#F4F6FA;font-size:14px;font-weight:600;">${duration}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#A0A6B3;font-size:14px;">Location:</td>
                  <td style="padding:6px 0;color:#F4F6FA;font-size:14px;font-weight:600;">Onitsha, Nigeria (Hybrid)</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <!-- Requirements -->
          <h3 style="color:#F4F6FA;font-size:16px;margin:0 0 12px;">Programme Requirements</h3>
          <ul style="color:#A0A6B3;font-size:14px;line-height:2;margin:0 0 32px;padding-left:20px;">
            <li>A working laptop (Windows or Mac)</li>
            <li>Stable internet connection</li>
            <li>Dedication and willingness to learn</li>
            <li>Commitment to attend all scheduled classes</li>
          </ul>

          <!-- Login Credentials -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1115;border-radius:8px;border:1px solid #D66A1F;margin:0 0 32px;">
            <tr><td style="padding:20px 24px;border-bottom:1px solid #2A2F3A;">
              <p style="margin:0;color:#D66A1F;font-size:11px;letter-spacing:1px;font-weight:700;">YOUR STUDENT PORTAL CREDENTIALS</p>
            </td></tr>
            <tr><td style="padding:20px 24px;">
              <table width="100%">
                <tr>
                  <td style="padding:6px 0;color:#A0A6B3;font-size:14px;width:140px;">Login URL:</td>
                  <td style="padding:6px 0;font-size:14px;"><a href="${loginUrl}" style="color:#1E4BFF;">${loginUrl}</a></td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#A0A6B3;font-size:14px;">Email:</td>
                  <td style="padding:6px 0;color:#F4F6FA;font-size:14px;font-weight:600;">${email}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#A0A6B3;font-size:14px;">Password:</td>
                  <td style="padding:6px 0;color:#F4F6FA;font-size:14px;font-weight:700;font-family:monospace;background:#171A21;padding:8px 12px;border-radius:4px;">${password}</td>
                </tr>
              </table>
              <p style="color:#A0A6B3;font-size:12px;margin:16px 0 0;line-height:1.6;">
                Please log in and change your password after your first sign-in. Keep these credentials safe and do not share them.
              </p>
            </td></tr>
          </table>

          <div style="text-align:center;margin:0 0 32px;">
            <a href="${loginUrl}" style="display:inline-block;background:#D66A1F;color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:6px;font-size:14px;font-weight:700;letter-spacing:1px;">ACCESS STUDENT PORTAL</a>
          </div>

          <p style="color:#A0A6B3;font-size:14px;line-height:1.6;margin:0;border-top:1px solid #2A2F3A;padding-top:24px;">
            If you have any questions, reply to this email or reach us at <a href="mailto:admin@goallordcreativity.com" style="color:#D66A1F;">admin@goallordcreativity.com</a>. We look forward to seeing you grow!
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 40px;border-top:1px solid #2A2F3A;text-align:center;">
          <p style="color:#A0A6B3;font-size:12px;margin:0;">Goallord Creativity Limited &bull; Onitsha, Nigeria</p>
          <p style="margin:4px 0 0;"><a href="mailto:admin@goallordcreativity.com" style="color:#D66A1F;font-size:12px;text-decoration:none;">admin@goallordcreativity.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = { verificationEmail, acceptanceEmail };
