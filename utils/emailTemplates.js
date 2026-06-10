function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

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
          <p style="color:#A0A6B3;font-size:15px;line-height:1.6;margin:0 0 12px;">Hi ${esc(fullName)},</p>
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
          <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:1px;">Congratulations - You've Been Accepted!</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <p style="color:#A0A6B3;font-size:15px;line-height:1.6;margin:0 0 12px;">Hi ${esc(fullName)},</p>
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
                  <td style="padding:6px 0;color:#F4F6FA;font-size:14px;font-weight:600;">${esc(track)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#A0A6B3;font-size:14px;">Duration:</td>
                  <td style="padding:6px 0;color:#F4F6FA;font-size:14px;font-weight:600;">${esc(duration)}</td>
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
                  <td style="padding:6px 0;color:#F4F6FA;font-size:14px;font-weight:600;">${esc(email)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#A0A6B3;font-size:14px;">Password:</td>
                  <td style="padding:6px 0;color:#F4F6FA;font-size:14px;font-weight:700;font-family:monospace;background:#171A21;padding:8px 12px;border-radius:4px;">${esc(password)}</td>
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

function adminNewApplicationEmail({ fullName, email, phone, track, dashboardUrl }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>New Application</title></head>
<body style="margin:0;padding:0;background:#0F1115;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1115;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#171A21;border-radius:12px;border:1px solid #2A2F3A;overflow:hidden;max-width:600px;width:100%;">
        <tr><td style="background:#1E4BFF;padding:24px 40px;">
          <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:2px;">NEW APPLICATION RECEIVED</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="color:#A0A6B3;font-size:15px;line-height:1.6;margin:0 0 24px;">A new student has applied to Goallord Creativity Academy.</p>
          <table width="100%" style="background:#0F1115;border-radius:8px;border:1px solid #2A2F3A;">
            <tr><td style="padding:20px 24px;">
              <table width="100%">
                <tr><td style="padding:6px 0;color:#A0A6B3;font-size:14px;width:120px;">Name:</td><td style="padding:6px 0;color:#F4F6FA;font-size:14px;font-weight:600;">${esc(fullName)}</td></tr>
                <tr><td style="padding:6px 0;color:#A0A6B3;font-size:14px;">Email:</td><td style="padding:6px 0;color:#F4F6FA;font-size:14px;">${esc(email)}</td></tr>
                <tr><td style="padding:6px 0;color:#A0A6B3;font-size:14px;">Phone:</td><td style="padding:6px 0;color:#F4F6FA;font-size:14px;">${esc(phone || '-')}</td></tr>
                <tr><td style="padding:6px 0;color:#A0A6B3;font-size:14px;">Track:</td><td style="padding:6px 0;color:#D66A1F;font-size:14px;font-weight:600;">${esc(track || 'Not selected')}</td></tr>
              </table>
            </td></tr>
          </table>
          <div style="text-align:center;margin:32px 0 0;">
            <a href="${dashboardUrl}" style="display:inline-block;background:#1E4BFF;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:1px;">VIEW IN DASHBOARD</a>
          </div>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #2A2F3A;text-align:center;">
          <p style="color:#A0A6B3;font-size:12px;margin:0;">Goallord Creativity Limited &bull; Onitsha, Nigeria</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function adminAcceptanceNotificationEmail({ fullName, email, track, studentId, dashboardUrl }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Applicant Accepted</title></head>
<body style="margin:0;padding:0;background:#0F1115;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1115;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#171A21;border-radius:12px;border:1px solid #2A2F3A;overflow:hidden;max-width:600px;width:100%;">
        <tr><td style="background:#D66A1F;padding:24px 40px;">
          <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:2px;">APPLICANT ACCEPTED</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="color:#A0A6B3;font-size:15px;line-height:1.6;margin:0 0 24px;">A student account has been created and an acceptance email with login credentials has been sent to the applicant.</p>
          <table width="100%" style="background:#0F1115;border-radius:8px;border:1px solid #2A2F3A;">
            <tr><td style="padding:20px 24px;">
              <table width="100%">
                <tr><td style="padding:6px 0;color:#A0A6B3;font-size:14px;width:120px;">Name:</td><td style="padding:6px 0;color:#F4F6FA;font-size:14px;font-weight:600;">${esc(fullName)}</td></tr>
                <tr><td style="padding:6px 0;color:#A0A6B3;font-size:14px;">Email:</td><td style="padding:6px 0;color:#F4F6FA;font-size:14px;">${esc(email)}</td></tr>
                <tr><td style="padding:6px 0;color:#A0A6B3;font-size:14px;">Track:</td><td style="padding:6px 0;color:#D66A1F;font-size:14px;font-weight:600;">${esc(track)}</td></tr>
                <tr><td style="padding:6px 0;color:#A0A6B3;font-size:14px;">Student ID:</td><td style="padding:6px 0;color:#F4F6FA;font-size:13px;font-family:monospace;">${esc(studentId)}</td></tr>
              </table>
            </td></tr>
          </table>
          <div style="text-align:center;margin:32px 0 0;">
            <a href="${dashboardUrl}" style="display:inline-block;background:#D66A1F;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:1px;">VIEW IN DASHBOARD</a>
          </div>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #2A2F3A;text-align:center;">
          <p style="color:#A0A6B3;font-size:12px;margin:0;">Goallord Creativity Limited &bull; Onitsha, Nigeria</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function passwordResetEmail({ fullName, resetUrl, role }) {
  const roleLabel = role === 'lecturer' ? 'Lecturer' : 'Student';
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Reset Your Password</title></head>
<body style="margin:0;padding:0;background:#0F1115;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1115;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#171A21;border-radius:12px;border:1px solid #2A2F3A;overflow:hidden;max-width:600px;width:100%;">
        <tr><td style="background:#D66A1F;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:2px;">GOALLORD CREATIVITY</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:13px;letter-spacing:1px;">PASSWORD RESET - ${roleLabel.toUpperCase()} PORTAL</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <h2 style="color:#F4F6FA;font-size:22px;margin:0 0 16px;">Reset Your Password</h2>
          <p style="color:#A0A6B3;font-size:15px;line-height:1.6;margin:0 0 12px;">Hi ${esc(fullName)},</p>
          <p style="color:#A0A6B3;font-size:15px;line-height:1.6;margin:0 0 32px;">
            We received a request to reset your ${roleLabel} Portal password. Click the button below to set a new password. This link expires in <strong style="color:#F4F6FA;">1 hour</strong>.
          </p>
          <div style="text-align:center;margin:0 0 32px;">
            <a href="${resetUrl}" style="display:inline-block;background:#D66A1F;color:#fff;text-decoration:none;padding:16px 40px;border-radius:6px;font-size:14px;font-weight:700;letter-spacing:1px;">RESET MY PASSWORD</a>
          </div>
          <p style="color:#A0A6B3;font-size:13px;line-height:1.6;margin:0 0 8px;">Or copy and paste this link:</p>
          <p style="font-size:12px;word-break:break-all;margin:0 0 32px;"><a href="${resetUrl}" style="color:#D66A1F;">${resetUrl}</a></p>
          <p style="color:#A0A6B3;font-size:13px;line-height:1.6;margin:0;border-top:1px solid #2A2F3A;padding-top:24px;">
            If you did not request a password reset, please ignore this email. Your password will not change.
          </p>
        </td></tr>
        <tr><td style="padding:24px 40px;border-top:1px solid #2A2F3A;text-align:center;">
          <p style="color:#A0A6B3;font-size:12px;margin:0;">Goallord Creativity Limited &bull; Onitsha, Nigeria</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function receiptEmail({ receiptNumber, date, recipientName, recipientEmail, description, amount, currency, method, reference, issuedBy }) {
  const formattedDate = new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const formattedAmount = currency + Number(amount).toLocaleString();
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt ${receiptNumber}</title>
</head>
<body style="margin:0;padding:0;background:#0F1115;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1115;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#171A21;border-radius:12px;border:1px solid #2A2F3A;overflow:hidden;max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background:#D66A1F;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:2px;">GOALLORD CREATIVITY</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:13px;letter-spacing:1px;">PAYMENT RECEIPT</p>
        </td></tr>
        <!-- Receipt Meta -->
        <tr><td style="background:#1E4BFF;padding:16px 40px;">
          <table width="100%">
            <tr>
              <td style="color:rgba(255,255,255,0.75);font-size:12px;letter-spacing:.5px;">RECEIPT NO.</td>
              <td style="text-align:right;color:rgba(255,255,255,0.75);font-size:12px;letter-spacing:.5px;">DATE ISSUED</td>
            </tr>
            <tr>
              <td style="color:#ffffff;font-size:16px;font-weight:700;font-family:monospace;padding-top:4px;">${receiptNumber}</td>
              <td style="text-align:right;color:#ffffff;font-size:14px;font-weight:600;padding-top:4px;">${formattedDate}</td>
            </tr>
          </table>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <!-- Bill To -->
          <h3 style="color:#A0A6B3;font-size:11px;letter-spacing:1px;margin:0 0 12px;text-transform:uppercase;">Bill To</h3>
          <p style="color:#F4F6FA;font-size:16px;font-weight:600;margin:0 0 4px;">${esc(recipientName)}</p>
          <p style="color:#A0A6B3;font-size:14px;margin:0 0 32px;">${esc(recipientEmail)}</p>

          <!-- Items Table -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #2A2F3A;border-radius:8px;overflow:hidden;margin-bottom:32px;">
            <thead>
              <tr style="background:#0F1115;">
                <th style="padding:12px 16px;text-align:left;color:#A0A6B3;font-size:11px;letter-spacing:.5px;font-weight:600;text-transform:uppercase;">Description</th>
                <th style="padding:12px 16px;text-align:right;color:#A0A6B3;font-size:11px;letter-spacing:.5px;font-weight:600;text-transform:uppercase;">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-top:1px solid #2A2F3A;">
                <td style="padding:14px 16px;color:#F4F6FA;font-size:14px;">${esc(description)}</td>
                <td style="padding:14px 16px;color:#F4F6FA;font-size:14px;font-weight:600;text-align:right;">${formattedAmount}</td>
              </tr>
              <tr style="background:#0F1115;border-top:1px solid #2A2F3A;">
                <td style="padding:12px 16px;color:#F4F6FA;font-size:14px;font-weight:700;text-align:right;">Total</td>
                <td style="padding:12px 16px;color:#D66A1F;font-size:16px;font-weight:800;text-align:right;">${formattedAmount}</td>
              </tr>
            </tbody>
          </table>

          <!-- Payment Details -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1115;border-radius:8px;border:1px solid #2A2F3A;margin-bottom:32px;">
            <tr><td style="padding:16px 20px;border-bottom:1px solid #2A2F3A;">
              <p style="margin:0;color:#A0A6B3;font-size:11px;letter-spacing:1px;font-weight:600;text-transform:uppercase;">Payment Details</p>
            </td></tr>
            <tr><td style="padding:16px 20px;">
              <table width="100%">
                <tr>
                  <td style="padding:5px 0;color:#A0A6B3;font-size:13px;width:130px;">Method:</td>
                  <td style="padding:5px 0;color:#F4F6FA;font-size:13px;font-weight:600;">${esc(method)}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#A0A6B3;font-size:13px;">Reference:</td>
                  <td style="padding:5px 0;color:#F4F6FA;font-size:13px;font-family:monospace;">${esc(reference)}</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <!-- Footer message -->
          <p style="color:#A0A6B3;font-size:13px;line-height:1.6;margin:0;border-top:1px solid #2A2F3A;padding-top:24px;text-align:center;">
            Thank you for your payment.<br>
            <strong style="color:#F4F6FA;">${esc(issuedBy)}</strong>
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 40px;border-top:1px solid #2A2F3A;text-align:center;">
          <p style="color:#A0A6B3;font-size:12px;margin:0;">Goallord Creativity Limited &bull; Onitsha, Nigeria</p>
          <p style="margin:4px 0 0;"><a href="mailto:hello@goallordcreativity.com" style="color:#D66A1F;font-size:12px;text-decoration:none;">hello@goallordcreativity.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Payment reminder ──────────────────────────────────────────
function paymentReminderEmail({ fullName, category, amountDue, dueDate, isOverdue, loginUrl }) {
  const label = { tuition_month_1:'Tuition - Month 1', tuition_month_2:'Tuition - Month 2', tuition_month_3:'Tuition - Month 3', full_tuition_payment:'Full Tuition Payment' }[category] || category;
  const dueDateStr = new Date(dueDate).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  const headerBg  = isOverdue ? '#ef4444' : '#D66A1F';
  const subject   = isOverdue ? `OVERDUE: ${label} - Action Required` : `Reminder: ${label} due ${dueDateStr}`;
  const headline  = isOverdue ? `⚠️ Payment Overdue` : `💳 Payment Reminder`;
  const bodyText  = isOverdue
    ? `Your <strong>${label}</strong> of <strong>₦${Number(amountDue).toLocaleString()}</strong> was due on <strong>${dueDateStr}</strong> and has not been received. Please log in and make your payment immediately to avoid suspension.`
    : `Your <strong>${label}</strong> of <strong>₦${Number(amountDue).toLocaleString()}</strong> is due on <strong>${dueDateStr}</strong>. Please log in to your student portal to make your payment.`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0F1115;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#171A21;border-radius:12px;border:1px solid #2A2F3A;overflow:hidden;">
      <tr><td style="background:${headerBg};padding:24px 32px;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">${headline}</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Goallord Creativity Academy</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="color:#F4F6FA;font-size:15px;margin:0 0 16px;">Hi <strong>${esc(fullName)}</strong>,</p>
        <p style="color:#F4F6FA;font-size:14px;line-height:1.7;margin:0 0 24px;">${bodyText}</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${loginUrl}" style="display:inline-block;background:${headerBg};color:#fff;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:700;font-size:14px;">Pay Now</a>
        </div>
        <hr style="border:none;border-top:1px solid #2A2F3A;margin:24px 0;">
        <p style="color:#A0A6B3;font-size:12px;margin:0;">Questions? Email <a href="mailto:hello@goallordcreativity.com" style="color:#D66A1F;">hello@goallordcreativity.com</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// ── Account suspension ────────────────────────────────────────
function suspensionEmail({ fullName, loginUrl }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0F1115;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#171A21;border-radius:12px;border:1px solid #2A2F3A;overflow:hidden;">
      <tr><td style="background:#ef4444;padding:24px 32px;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">⚠️ Account Suspended</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Goallord Creativity Academy</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="color:#F4F6FA;font-size:15px;margin:0 0 16px;">Hi <strong>${esc(fullName)}</strong>,</p>
        <p style="color:#F4F6FA;font-size:14px;line-height:1.7;margin:0 0 24px;">Your student account has been <strong>suspended</strong> due to an overdue payment that remains unpaid. You will not be able to access your student dashboard until the outstanding balance is settled.</p>
        <p style="color:#F4F6FA;font-size:14px;line-height:1.7;margin:0 0 24px;">Please log in to your student portal and make your payment immediately to reactivate your account.</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${loginUrl}" style="display:inline-block;background:#ef4444;color:#fff;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:700;font-size:14px;">Settle Balance &amp; Reactivate</a>
        </div>
        <hr style="border:none;border-top:1px solid #2A2F3A;margin:24px 0;">
        <p style="color:#A0A6B3;font-size:12px;margin:0;">Questions? Email <a href="mailto:hello@goallordcreativity.com" style="color:#D66A1F;">hello@goallordcreativity.com</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// ── Graduation ────────────────────────────────────────────────
function graduationEmail({ fullName, batchName, track, loginUrl }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0F1115;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#171A21;border-radius:12px;border:1px solid #2A2F3A;overflow:hidden;">
      <tr><td style="background:linear-gradient(135deg,#1E4BFF 0%,#D66A1F 100%);padding:24px 32px;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">🎓 Congratulations, ${esc(fullName)}!</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Goallord Creativity Academy</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="color:#F4F6FA;font-size:15px;margin:0 0 16px;">Hi <strong>${esc(fullName)}</strong>,</p>
        <p style="color:#F4F6FA;font-size:14px;line-height:1.7;margin:0 0 16px;">We are incredibly proud to announce that you have successfully <strong>graduated</strong> from the <strong>${esc(track)}</strong> program at Goallord Creativity Academy${batchName ? ' - <strong>' + esc(batchName) + '</strong>' : ''}.</p>
        <p style="color:#F4F6FA;font-size:14px;line-height:1.7;margin:0 0 24px;">Your dedication, hard work, and creativity throughout this journey have been outstanding. You are now equipped with the skills to build an amazing career. Go forth and create!</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${loginUrl}" style="display:inline-block;background:#D66A1F;color:#fff;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:700;font-size:14px;">View Your Dashboard</a>
        </div>
        <hr style="border:none;border-top:1px solid #2A2F3A;margin:24px 0;">
        <p style="color:#A0A6B3;font-size:12px;margin:0;">- The Goallord Creativity Academy Team &nbsp;·&nbsp; <a href="mailto:hello@goallordcreativity.com" style="color:#D66A1F;">hello@goallordcreativity.com</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// ── Account reactivation ──────────────────────────────────────
function reactivationEmail({ fullName, loginUrl }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0F1115;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#171A21;border-radius:12px;border:1px solid #2A2F3A;overflow:hidden;">
      <tr><td style="background:#22c55e;padding:24px 32px;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">✅ Account Reactivated</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Goallord Creativity Academy</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="color:#F4F6FA;font-size:15px;margin:0 0 16px;">Hi <strong>${esc(fullName)}</strong>,</p>
        <p style="color:#F4F6FA;font-size:14px;line-height:1.7;margin:0 0 24px;">Great news - your outstanding payment has been confirmed and your student account is now <strong>fully reactivated</strong>. You can log in and resume your studies.</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${loginUrl}" style="display:inline-block;background:#22c55e;color:#fff;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:700;font-size:14px;">Log In Now</a>
        </div>
        <hr style="border:none;border-top:1px solid #2A2F3A;margin:24px 0;">
        <p style="color:#A0A6B3;font-size:12px;margin:0;">Questions? Email <a href="mailto:hello@goallordcreativity.com" style="color:#D66A1F;">hello@goallordcreativity.com</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// ── Contact form: admin notification ──────────────────────────
function adminContactEmail({ name, email, service, budget, message, dashboardUrl }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0F1115;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#171A21;border-radius:12px;border:1px solid #2A2F3A;overflow:hidden;">
      <tr><td style="background:#D66A1F;padding:24px 32px;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">📬 New Contact Message</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Via the website contact form</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:8px 0;border-bottom:1px solid #2A2F3A;">
            <span style="color:#A0A6B3;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">From</span>
            <p style="margin:4px 0 0;color:#F4F6FA;font-size:15px;font-weight:600;">${esc(name)} &lt;${esc(email)}&gt;</p>
          </td></tr>
          ${service ? `<tr><td style="padding:8px 0;border-bottom:1px solid #2A2F3A;">
            <span style="color:#A0A6B3;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Service Needed</span>
            <p style="margin:4px 0 0;color:#F4F6FA;font-size:14px;">${esc(service)}</p>
          </td></tr>` : ''}
          ${budget ? `<tr><td style="padding:8px 0;border-bottom:1px solid #2A2F3A;">
            <span style="color:#A0A6B3;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Budget</span>
            <p style="margin:4px 0 0;color:#F4F6FA;font-size:14px;">${esc(budget)}</p>
          </td></tr>` : ''}
          <tr><td style="padding:16px 0 0;">
            <span style="color:#A0A6B3;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Message</span>
            <p style="margin:8px 0 0;color:#F4F6FA;font-size:14px;line-height:1.6;background:#0F1115;padding:14px;border-radius:8px;">${esc(message)}</p>
          </td></tr>
        </table>
        <div style="margin-top:24px;text-align:center;">
          <a href="${dashboardUrl}#contacts" style="display:inline-block;background:#D66A1F;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:13px;">Reply in Dashboard</a>
        </div>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// ── Contact form: auto-reply to sender ────────────────────────
function contactAutoReplyEmail({ name }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0F1115;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#171A21;border-radius:12px;border:1px solid #2A2F3A;overflow:hidden;">
      <tr><td style="background:#D66A1F;padding:24px 32px;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Thanks for reaching out, ${esc(name)}!</h1>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="color:#F4F6FA;font-size:15px;line-height:1.7;margin:0 0 16px;">We've received your message and will get back to you within <strong>24–48 hours</strong>.</p>
        <p style="color:#A0A6B3;font-size:13px;line-height:1.6;margin:0;">If your matter is urgent, email us directly at <a href="mailto:hello@goallordcreativity.com" style="color:#D66A1F;">hello@goallordcreativity.com</a></p>
        <hr style="border:none;border-top:1px solid #2A2F3A;margin:24px 0;">
        <p style="color:#A0A6B3;font-size:12px;margin:0;">- Goallord Creativity Team</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// ── Contact reply from admin ───────────────────────────────────
function contactReplyEmail({ name, replyBody }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0F1115;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#171A21;border-radius:12px;border:1px solid #2A2F3A;overflow:hidden;">
      <tr><td style="background:#D66A1F;padding:24px 32px;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Reply from Goallord Creativity</h1>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="color:#F4F6FA;font-size:15px;margin:0 0 8px;">Hi ${esc(name)},</p>
        <div style="color:#F4F6FA;font-size:14px;line-height:1.7;background:#0F1115;padding:14px;border-radius:8px;margin:16px 0;">${esc(replyBody).replace(/\n/g, '<br>')}</div>
        <hr style="border:none;border-top:1px solid #2A2F3A;margin:24px 0;">
        <p style="color:#A0A6B3;font-size:12px;margin:0;">- Goallord Creativity Team &nbsp;·&nbsp; <a href="mailto:hello@goallordcreativity.com" style="color:#D66A1F;">hello@goallordcreativity.com</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function applicantPaymentReminderEmail({ fullName, track, paymentUrl }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0F1115;font-family:'Segoe UI',system-ui,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:40px 20px;">
<tr><td>
  <h2 style="color:#D66A1F;font-size:20px;margin:0 0 16px;">Hi ${fullName},</h2>
  <p style="color:#A0A6B3;font-size:15px;line-height:1.7;margin:0 0 16px;">
    We noticed you verified your email for the <strong style="color:#F4F6FA;">${track || 'Academy'}</strong> programme but haven't completed your enrolment payment yet.
  </p>
  <p style="color:#A0A6B3;font-size:15px;line-height:1.7;margin:0 0 24px;">
    Spots are limited for this intake. Complete your payment now to secure your place and receive your student login details instantly.
  </p>
  <a href="${paymentUrl}" style="display:inline-block;background:#D66A1F;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Complete Payment →</a>
  <p style="color:#555;font-size:13px;margin-top:32px;line-height:1.6;">
    If you've already paid, please ignore this email. If you have questions, reply to this email or contact us at academy@goallordcreativity.com.
  </p>
  <p style="color:#333;font-size:12px;margin-top:24px;">- Goallord Creativity Academy</p>
</td></tr></table></body></html>`;
}

// ── Paystack failure - retry email ───────────────────────────
function paymentRetryEmail({ fullName, category, amountDue, loginUrl }) {
  const label = { application_fee:'Application Fee', tuition_month_1:'Tuition - Month 1', tuition_month_2:'Tuition - Month 2', tuition_month_3:'Tuition - Month 3', full_tuition_payment:'Full Tuition Payment' }[category] || category || 'your payment';
  const amt = amountDue != null ? `<strong>₦${Number(amountDue).toLocaleString()}</strong>` : 'your balance';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0F1115;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#171A21;border-radius:12px;border:1px solid #2A2F3A;overflow:hidden;">
      <tr><td style="background:#D66A1F;padding:24px 32px;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Your payment didn't go through</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Goallord Creativity Academy</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="color:#F4F6FA;font-size:15px;margin:0 0 16px;">Hi <strong>${esc(fullName)}</strong>,</p>
        <p style="color:#F4F6FA;font-size:14px;line-height:1.7;margin:0 0 20px;">We couldn't confirm your payment of ${amt} for <strong>${esc(label)}</strong>. No money has been taken - if you were debited, it will be reversed automatically by your bank.</p>
        <p style="color:#F4F6FA;font-size:14px;line-height:1.7;margin:0 0 24px;">Please sign in and try again. You can pay by card, bank transfer, or cash.</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${loginUrl}" style="display:inline-block;background:#D66A1F;color:#fff;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:700;font-size:14px;">Retry Payment</a>
        </div>
        <hr style="border:none;border-top:1px solid #2A2F3A;margin:24px 0;">
        <p style="color:#A0A6B3;font-size:12px;margin:0;">Trouble paying? Email <a href="mailto:hello@goallordcreativity.com" style="color:#D66A1F;">hello@goallordcreativity.com</a> and we'll help.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// ── Proforma invoice (corporate payers) ──────────────────────
function proformaInvoiceEmail({ proformaNumber, date, companyName, companyAddress, studentName, description, amount, currency = '₦', dueDate, issuedBy = 'Goallord Creativity Academy', payUrl }) {
  const dateStr = new Date(date).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  const dueStr  = dueDate ? new Date(dueDate).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }) : null;
  const amt = `${currency}${Number(amount).toLocaleString()}`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0F1115;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#171A21;border-radius:12px;border:1px solid #2A2F3A;overflow:hidden;">
      <tr><td style="background:#1E4BFF;padding:24px 32px;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:0.5px;">PROFORMA INVOICE</h1>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${esc(issuedBy)}</p>
      </td></tr>
      <tr><td style="padding:28px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td style="vertical-align:top;">
              <div style="color:#A0A6B3;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Billed To</div>
              <div style="color:#F4F6FA;font-size:14px;font-weight:700;">${esc(companyName || studentName)}</div>
              ${companyAddress ? `<div style="color:#A0A6B3;font-size:12px;line-height:1.5;margin-top:2px;">${esc(companyAddress)}</div>` : ''}
              ${companyName && studentName ? `<div style="color:#A0A6B3;font-size:12px;margin-top:4px;">Re: ${esc(studentName)}</div>` : ''}
            </td>
            <td style="vertical-align:top;text-align:right;">
              <div style="color:#A0A6B3;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Invoice No.</div>
              <div style="color:#F4F6FA;font-size:14px;font-weight:700;font-family:monospace;">${esc(proformaNumber)}</div>
              <div style="color:#A0A6B3;font-size:12px;margin-top:6px;">Date: ${dateStr}</div>
              ${dueStr ? `<div style="color:#A0A6B3;font-size:12px;">Due: ${dueStr}</div>` : ''}
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #2A2F3A;border-radius:8px;overflow:hidden;">
          <tr style="background:rgba(255,255,255,0.03);">
            <td style="padding:11px 16px;color:#A0A6B3;font-size:12px;font-weight:600;">Description</td>
            <td style="padding:11px 16px;color:#A0A6B3;font-size:12px;font-weight:600;text-align:right;">Amount</td>
          </tr>
          <tr>
            <td style="padding:14px 16px;color:#F4F6FA;font-size:14px;border-top:1px solid #2A2F3A;">${esc(description)}</td>
            <td style="padding:14px 16px;color:#F4F6FA;font-size:14px;font-weight:600;text-align:right;border-top:1px solid #2A2F3A;">${amt}</td>
          </tr>
          <tr>
            <td style="padding:13px 16px;color:#F4F6FA;font-size:15px;font-weight:700;border-top:1px solid #2A2F3A;">Total Due</td>
            <td style="padding:13px 16px;color:#D66A1F;font-size:16px;font-weight:800;text-align:right;border-top:1px solid #2A2F3A;">${amt}</td>
          </tr>
        </table>
        ${payUrl ? `<div style="text-align:center;margin:26px 0 8px;"><a href="${payUrl}" style="display:inline-block;background:#1E4BFF;color:#fff;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:700;font-size:14px;">Pay Invoice</a></div>` : ''}
        <p style="color:#A0A6B3;font-size:12px;line-height:1.6;margin:22px 0 0;">This is a proforma invoice issued for payment authorisation. It is not a tax invoice/receipt. A receipt is issued once payment is confirmed.</p>
        <hr style="border:none;border-top:1px solid #2A2F3A;margin:20px 0;">
        <p style="color:#A0A6B3;font-size:12px;margin:0;">Questions? Email <a href="mailto:hello@goallordcreativity.com" style="color:#D66A1F;">hello@goallordcreativity.com</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// ── Flashcard reminder (6 PM nudge on class days) ─────────────
function flashcardReminderEmail({ fullName, topic, week, day, count, loginUrl, logoUrl }) {
  const safeTopic = esc(topic || "today's lesson");
  const c = Number(count) || 10;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flashcards due today</title></head>
<body style="margin:0;padding:0;background:#0B0D10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0B0D10;">You haven't done today's ${safeTopic} flashcards yet — finish before the day ends.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0D10;"><tr><td align="center" style="padding:36px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <tr><td align="center" style="padding:0 0 24px;">
        <img src="${logoUrl}" alt="Goallord Creativity" width="156" style="display:block;width:156px;height:auto;border:0;outline:none;text-decoration:none;">
      </td></tr>

      <tr><td style="background:#171A21;border:1px solid #2A2F3A;border-radius:18px;overflow:hidden;">
        <div style="height:4px;background:#D66A1F;line-height:4px;font-size:0;">&nbsp;</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:36px 38px 34px;">
          <div style="font-size:32px;line-height:1;margin:0 0 16px;">⏰</div>
          <h1 style="margin:0 0 8px;color:#F4F6FA;font-size:23px;font-weight:800;letter-spacing:-0.02em;">Today's flashcards are waiting</h1>
          <p style="margin:0 0 24px;color:#A0A6B3;font-size:14.5px;line-height:1.65;">Hi ${esc(fullName)}, you haven't completed today's quiz yet. It only takes a few minutes — finish before the day ends so it counts as done.</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0F1115;border:1px solid #2A2F3A;border-radius:14px;">
            <tr><td style="padding:20px 22px;">
              <p style="margin:0 0 5px;color:#D66A1F;font-size:11.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;">Week ${esc(String(week))} · ${esc(day || '')}</p>
              <p style="margin:0 0 9px;color:#F4F6FA;font-size:18px;font-weight:700;line-height:1.3;">${safeTopic}</p>
              <p style="margin:0;color:#A0A6B3;font-size:13px;">${c} quick questions · about 5 minutes</p>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 0 6px;">
            <a href="${loginUrl}" style="display:inline-block;background:#D66A1F;color:#1a0f06;text-decoration:none;padding:15px 38px;border-radius:11px;font-weight:800;font-size:15px;">Do my flashcards &nbsp;&rarr;</a>
          </td></tr></table>
          <p style="margin:16px 0 0;color:#6B7280;font-size:12px;text-align:center;">Complete it today to keep your progress tracker green.</p>
        </td></tr></table>
      </td></tr>

      <tr><td align="center" style="padding:24px 16px 0;">
        <p style="margin:0 0 5px;color:#8892A4;font-size:12px;">Goallord Creativity Academy · Onitsha, Nigeria</p>
        <p style="margin:0;color:#6B7280;font-size:12px;">Questions? <a href="mailto:hello@goallordcreativity.com" style="color:#D66A1F;text-decoration:none;">hello@goallordcreativity.com</a></p>
      </td></tr>

    </table>
  </td></tr></table>
</body></html>`;
}

// ── Flashcard missed (next-morning catch-up follow-up) ────────
function flashcardMissedEmail({ fullName, topic, week, day, count, loginUrl, logoUrl }) {
  const safeTopic = esc(topic || "yesterday's lesson");
  const c = Number(count) || 10;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Catch up on your flashcards</title></head>
<body style="margin:0;padding:0;background:#0B0D10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0B0D10;">You missed ${safeTopic} flashcards — they're still open, catch up now.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0D10;"><tr><td align="center" style="padding:36px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <tr><td align="center" style="padding:0 0 24px;">
        <img src="${logoUrl}" alt="Goallord Creativity" width="156" style="display:block;width:156px;height:auto;border:0;outline:none;text-decoration:none;">
      </td></tr>

      <tr><td style="background:#171A21;border:1px solid #2A2F3A;border-radius:18px;overflow:hidden;">
        <div style="height:4px;background:#ef4444;line-height:4px;font-size:0;">&nbsp;</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:36px 38px 34px;">
          <div style="font-size:32px;line-height:1;margin:0 0 16px;">⏳</div>
          <h1 style="margin:0 0 8px;color:#F4F6FA;font-size:23px;font-weight:800;letter-spacing:-0.02em;">You missed yesterday's flashcards</h1>
          <p style="margin:0 0 24px;color:#A0A6B3;font-size:14.5px;line-height:1.65;">Hi ${esc(fullName)}, you didn't finish yesterday's quiz. Good news — it's still open. A few minutes now puts it back on track and keeps your progress green.</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0F1115;border:1px solid #2A2F3A;border-radius:14px;">
            <tr><td style="padding:20px 22px;">
              <p style="margin:0 0 5px;color:#ef4444;font-size:11.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;">Missed · Week ${esc(String(week))} · ${esc(day || '')}</p>
              <p style="margin:0 0 9px;color:#F4F6FA;font-size:18px;font-weight:700;line-height:1.3;">${safeTopic}</p>
              <p style="margin:0;color:#A0A6B3;font-size:13px;">${c} quick questions · about 5 minutes</p>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 0 6px;">
            <a href="${loginUrl}" style="display:inline-block;background:#D66A1F;color:#1a0f06;text-decoration:none;padding:15px 38px;border-radius:11px;font-weight:800;font-size:15px;">Catch up now &nbsp;&rarr;</a>
          </td></tr></table>
          <p style="margin:16px 0 0;color:#6B7280;font-size:12px;text-align:center;">It still counts once you complete it.</p>
        </td></tr></table>
      </td></tr>

      <tr><td align="center" style="padding:24px 16px 0;">
        <p style="margin:0 0 5px;color:#8892A4;font-size:12px;">Goallord Creativity Academy · Onitsha, Nigeria</p>
        <p style="margin:0;color:#6B7280;font-size:12px;">Questions? <a href="mailto:hello@goallordcreativity.com" style="color:#D66A1F;text-decoration:none;">hello@goallordcreativity.com</a></p>
      </td></tr>

    </table>
  </td></tr></table>
</body></html>`;
}

// ── Corporate transactional email shell ──────────────────────
// One refined, light, table-based layout shared by the flashcard and class
// notifications so they read as a coherent, professional set. Structure: a dark
// brand header band (where the white logo reads), a clean white content body
// with structured detail rows, an optional topic panel, a single solid CTA, and
// a muted footer. No icon glyphs/emoji, no gradients — corporate and trustworthy.
//   recap:    { topicLabel, topic, bodyLabel, body }  (body optional)
//   infoRows: [{ label, value }]
function corporateEmail({ eyebrow, heading, intro, recap, infoRows = [], ctaLabel, ctaUrl, footnote, logoUrl, preheader }) {
  const rows = (infoRows || []).filter(r => r && r.value != null && String(r.value).trim() !== '');
  const infoTable = rows.length ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FB;border:1px solid #E7E9EF;border-radius:10px;margin:0 0 8px;">
            <tr><td style="padding:6px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${rows.map((r, i) => `<tr>
                  <td style="padding:13px 0;${i ? 'border-top:1px solid #ECEEF3;' : ''}color:#737B8A;font-size:13px;line-height:1.4;">${esc(r.label)}</td>
                  <td align="right" style="padding:13px 0;${i ? 'border-top:1px solid #ECEEF3;' : ''}color:#1A1D24;font-size:13.5px;font-weight:600;line-height:1.4;">${esc(String(r.value))}</td>
                </tr>`).join('')}
              </table>
            </td></tr>
          </table>` : '';

  const recapPanel = (recap && recap.topic) ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #E7E9EF;border-left:3px solid #D66A1F;border-radius:8px;margin:0 0 22px;">
            <tr><td style="padding:20px 22px;">
              <p style="margin:0 0 6px;color:#9098A6;font-size:10.5px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;">${esc(recap.topicLabel || 'Topic')}</p>
              <p style="margin:0${recap.body ? ' 0 16px' : ''};color:#14171F;font-size:18px;font-weight:700;line-height:1.35;">${esc(recap.topic)}</p>
              ${recap.body ? `<p style="margin:0 0 5px;color:#9098A6;font-size:10.5px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;">${esc(recap.bodyLabel || 'Summary')}</p>
              <p style="margin:0;color:#4A5160;font-size:14.5px;line-height:1.65;">${esc(recap.body)}</p>` : ''}
            </td></tr>
          </table>` : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#EDEEF2;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#EDEEF2;">${esc(preheader || '')}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDEEF2;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border:1px solid #E2E5EB;border-radius:14px;overflow:hidden;">

      <!-- Brand header band -->
      <tr><td style="background:#11141A;padding:30px 40px 0;text-align:center;">
        <img src="${logoUrl}" alt="Goallord Creativity Academy" width="150" style="display:inline-block;width:150px;height:auto;border:0;outline:none;text-decoration:none;color:#FFFFFF;font-size:17px;font-weight:700;">
        <div style="height:30px;line-height:30px;font-size:0;">&nbsp;</div>
      </td></tr>
      <tr><td style="height:3px;background:#D66A1F;line-height:3px;font-size:0;">&nbsp;</td></tr>

      <!-- Body -->
      <tr><td style="padding:40px 40px 34px;">
        <p style="margin:0 0 10px;color:#D66A1F;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">${esc(eyebrow)}</p>
        <h1 style="margin:0 0 16px;color:#14171F;font-size:23px;font-weight:700;letter-spacing:-0.01em;line-height:1.3;">${esc(heading)}</h1>
        <p style="margin:0 0 26px;color:#4A5160;font-size:15px;line-height:1.7;">${intro}</p>

        ${recapPanel}${infoTable}

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:26px 0 6px;">
          <a href="${ctaUrl}" style="display:inline-block;background:#D66A1F;color:#FFFFFF;text-decoration:none;padding:14px 34px;border-radius:8px;font-weight:600;font-size:15px;letter-spacing:.2px;">${esc(ctaLabel)}</a>
        </td></tr></table>
        ${footnote ? `<p style="margin:18px 0 0;color:#8A93A3;font-size:12.5px;line-height:1.6;">${esc(footnote)}</p>` : ''}
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#F6F7F9;border-top:1px solid #E7E9EF;padding:26px 40px;">
        <p style="margin:0 0 6px;color:#3E4452;font-size:13px;font-weight:600;">Goallord Creativity Academy</p>
        <p style="margin:0 0 12px;color:#8A93A3;font-size:12.5px;line-height:1.6;">Onitsha, Nigeria &nbsp;&middot;&nbsp; <a href="mailto:hello@goallordcreativity.com" style="color:#D66A1F;text-decoration:none;">hello@goallordcreativity.com</a></p>
        <p style="margin:0;color:#A7AEBB;font-size:11.5px;line-height:1.6;">You are receiving this email because you are enrolled at Goallord Creativity Academy.</p>
      </td></tr>

    </table>
  </td></tr></table>
</body></html>`;
}

// Sent the moment a class's flashcards are auto-generated and published.
function flashcardReadyEmail({ fullName, topic, week, day, count, summary, flashcardsUrl, logoUrl }) {
  const c = Number(count) || 10;
  return corporateEmail({
    eyebrow: 'Flashcards · Ready',
    heading: 'Your flashcards are ready',
    intro: `Dear ${esc(fullName || 'Student')}, your revision flashcards for today&rsquo;s class are now available in your portal. They take about five minutes, and completing them while the lesson is fresh will help the material stick.`,
    recap: { topicLabel: 'Topic', topic: topic || 'Today’s lesson', bodyLabel: 'What was taught', body: (summary || '').trim() },
    infoRows: [
      week ? { label: 'Week', value: `Week ${week}` } : null,
      day ? { label: 'Class day', value: day } : null,
      { label: 'Questions', value: `${c}` },
      { label: 'Estimated time', value: 'About 5 minutes' },
    ].filter(Boolean),
    ctaLabel: 'Open your flashcards', ctaUrl: flashcardsUrl,
    footnote: 'Completing this set keeps your progress record up to date.',
    logoUrl,
    preheader: `Your ${topic || 'class'} flashcards are ready — about 5 minutes.`,
  });
}

// Sent the next day to students who still haven’t completed the set.
function flashcardDayAfterEmail({ fullName, topic, week, day, count, summary, flashcardsUrl, logoUrl }) {
  const c = Number(count) || 10;
  return corporateEmail({
    eyebrow: 'Flashcards · Reminder',
    heading: 'A reminder about your flashcards',
    intro: `Dear ${esc(fullName || 'Student')}, our records show you have not yet completed yesterday&rsquo;s flashcards. The set is still open &mdash; a few minutes now will keep your revision on track.`,
    recap: { topicLabel: 'Topic', topic: topic || 'Yesterday’s lesson', bodyLabel: 'What was taught', body: (summary || '').trim() },
    infoRows: [
      week ? { label: 'Week', value: `Week ${week}` } : null,
      day ? { label: 'Class day', value: day } : null,
      { label: 'Questions', value: `${c}` },
      { label: 'Estimated time', value: 'About 5 minutes' },
    ].filter(Boolean),
    ctaLabel: 'Complete them now', ctaUrl: flashcardsUrl,
    footnote: 'The set still counts towards your record the moment you complete it.',
    logoUrl,
    preheader: `Reminder: your ${topic || 'class'} flashcards are still waiting.`,
  });
}

// Early-morning class reminder, sent before class on a class day. When the
// batch has a curriculum entry for the day, the topic panel renders; otherwise
// it is omitted and the recipient still gets a clean reminder.
function classReminderEmail({ fullName, batchName, dayName, topic, details, loginUrl, logoUrl, audience }) {
  const safeTopic = (topic || '').trim();
  const safeDetails = (details || '').trim();
  const day = dayName || 'today';
  const isLecturer = audience === 'lecturer';
  const name = esc(fullName || (isLecturer ? 'Lecturer' : 'Student'));
  const intro = isLecturer
    ? `Dear ${name}, this is a reminder that you are scheduled to teach a class today.${safeTopic ? ' The topic and outline are below.' : ''}`
    : `Dear ${name}, this is a reminder that your class holds today.${safeTopic ? ' Here is what is planned.' : ' Please arrive on time and prepared.'}`;
  return corporateEmail({
    eyebrow: `${isLecturer ? 'Teaching reminder' : 'Class reminder'} · ${esc(day)}`,
    heading: isLecturer ? 'You are teaching today' : 'You have class today',
    intro,
    recap: safeTopic ? {
      topicLabel: 'Today’s topic', topic: safeTopic,
      bodyLabel: isLecturer ? 'What you’ll cover' : 'What you’ll learn',
      body: safeDetails,
    } : null,
    infoRows: [
      batchName ? { label: 'Class', value: batchName } : null,
      { label: 'Day', value: day },
    ].filter(Boolean),
    ctaLabel: isLecturer ? 'Open lecturer portal' : 'Open your portal', ctaUrl: loginUrl,
    footnote: isLecturer ? 'Please arrive ahead of time to set up.' : 'Please arrive on time and ready to learn.',
    logoUrl,
    preheader: `${isLecturer ? 'You are teaching' : 'You have class'} ${day}${safeTopic ? ` — ${safeTopic}` : ''}.`,
  });
}

module.exports = { verificationEmail, acceptanceEmail, adminNewApplicationEmail, adminAcceptanceNotificationEmail, passwordResetEmail, receiptEmail, adminContactEmail, contactAutoReplyEmail, contactReplyEmail, paymentReminderEmail, suspensionEmail, graduationEmail, reactivationEmail, applicantPaymentReminderEmail, paymentRetryEmail, proformaInvoiceEmail, flashcardReminderEmail, flashcardMissedEmail, flashcardReadyEmail, flashcardDayAfterEmail, classReminderEmail };
