// Renders every transactional email through the shared shell (utils/email/shell.js)
// with realistic sample data, into previews/*.html plus a gallery index.
// Run: node scripts/email-preview.js  then open previews/index.html
const fs = require('fs');
const path = require('path');
const { renderEmail } = require('../utils/email/shell');

const LOGO = '../assets/images/logo/goallord-logo.png'; // relative so previews load offline
const money = n => '₦' + Number(n).toLocaleString();

// Each entry: { name, title, group, html }
const emails = [];
const add = (name, title, group, opts) =>
  emails.push({ name, title, group, html: renderEmail({ logoUrl: LOGO, ...opts }) });

// ── Applicant / onboarding ───────────────────────────────────
add('verification', 'Verify email', 'Applicant', {
  preheader: 'Confirm your email to complete your application.',
  headline: 'Verify your email',
  blocks: [
    { type:'text', html:'Hi Chioma,' },
    { type:'text', html:'Thank you for applying to Goallord Creativity Academy. To complete your application, please confirm your email address using the button below.' },
    { type:'cta', label:'Verify my email', url:'#' },
    { type:'linkFallback', url:'https://goallordcreativity.com/api/applicants/verify/abc123' },
    { type:'note', html:'This link expires in 24 hours. If you did not apply, you can safely ignore this email.' }
  ],
  footerLine:'Welcome to Goallord Creativity Academy'
});

add('acceptance', 'Acceptance + login details', 'Applicant', {
  preheader: 'Your application is accepted. Here are your login details.',
  headline: "You're in, Chioma 🎉",
  blocks: [
    { type:'text', html:'Hi Chioma,' },
    { type:'text', html:'Your application to Goallord Creativity Academy has been reviewed and <strong style="color:#1F2430;font-weight:600;">accepted</strong>. Welcome to the programme. We are genuinely excited to have you.' },
    { type:'rows', label:'Your programme', rows:[['Track','AI Software Development'],['Duration','12 Weeks'],['Location','Onitsha, Nigeria (Hybrid)']] },
    { type:'panel', label:'Your student portal login', rows:[['Portal','<a href="#" style="color:#D66A1F;font-weight:600;text-decoration:none;">student-login.html</a>'],['Email','chioma.okafor@gmail.com']], mono:{ label:'Password', value:'Gl2026kQ7m' } },
    { type:'note', html:'For your security, please change your password after your first sign-in.' },
    { type:'cta', label:'Access student portal', url:'#' },
    { type:'heading', text:'Before your first class' },
    { type:'list', items:['A working laptop (Windows or Mac)','A stable internet connection','Dedication and a willingness to learn','Commitment to attend all scheduled classes'] },
    { type:'signoff', html:'Warmly,<br><strong style="font-weight:600;">The Goallord Creativity Team</strong>' }
  ],
  footerLine:'Welcome to the Goallord Creativity family 🎉'
});

add('applicant-payment-reminder', 'Finish enrolment nudge', 'Applicant', {
  preheader: 'Complete your enrolment payment to secure your place.',
  headline: 'Complete your enrolment',
  blocks: [
    { type:'text', html:'Hi Chioma,' },
    { type:'text', html:'You verified your email for the <strong style="color:#1F2430;font-weight:600;">AI Software Development</strong> programme but have not completed your enrolment payment yet.' },
    { type:'text', html:'Spots are limited for this intake. Complete your payment now to secure your place and receive your student login details instantly.' },
    { type:'cta', label:'Complete payment', url:'#' },
    { type:'note', html:'If you have already paid, please ignore this email.' }
  ]
});

add('payment-retry', "Payment didn't go through", 'Applicant', {
  preheader: "Your payment didn't go through. No money was taken.",
  headline: "Your payment didn't go through",
  blocks: [
    { type:'text', html:'Hi Chioma,' },
    { type:'callout', tone:'warn', html:'No money has been taken. If you were debited, your bank will reverse it automatically.' },
    { type:'text', html:'We could not confirm your payment of <strong>₦120,000</strong> for the <strong>Application Fee</strong>. Please sign in and try again. You can pay by card, bank transfer, or cash.' },
    { type:'cta', label:'Retry payment', url:'#' },
    { type:'note', html:"Trouble paying? Email admin@goallordcreativity.com and we'll help." }
  ]
});

// ── Payments ─────────────────────────────────────────────────
add('receipt', 'Payment receipt', 'Payments', {
  preheader: 'Your payment receipt from Goallord Creativity Academy.',
  headline: 'Payment receipt',
  blocks: [
    { type:'text', html:'Hi Chioma, thank you for your payment. Here is your receipt.' },
    { type:'receipt',
      meta:[['Receipt no.','RCP-2026-4F2A9C'],['Date','9 July 2026'],['Billed to','Chioma Okafor']],
      items:[['Application Fee', money(20000)],['Tuition, 1st Instalment', money(100000)]],
      total: money(120000) },
    { type:'panel', label:'Payment details', rows:[['Method','Paystack (Card / Bank)'],['Reference','ENROL-8d0a-1720']] },
    { type:'signoff', html:'Thank you for your payment,<br><strong style="font-weight:600;">Goallord Creativity Academy</strong>' }
  ]
});

add('proforma-invoice', 'Proforma invoice', 'Payments', {
  preheader: 'Proforma invoice for tuition payment.',
  headline: 'Proforma invoice',
  blocks: [
    { type:'rows', label:'Billed to', rows:[['Company','Acme Studios Ltd'],['Re: student','Chioma Okafor'],['Invoice no.','PRO-2026-0007'],['Due','23 July 2026']] },
    { type:'receipt', items:[['Full Tuition Payment, AI Software Development', money(300000)]], total: money(300000) },
    { type:'cta', label:'Pay invoice', url:'#' },
    { type:'note', html:'This is a proforma invoice issued for payment authorisation. It is not a tax receipt. A receipt is issued once payment is confirmed.' }
  ]
});

add('payment-reminder', 'Payment reminder', 'Payments', {
  preheader: 'Your tuition payment is coming up.',
  headline: 'Payment reminder',
  blocks: [
    { type:'text', html:'Hi Chioma,' },
    { type:'text', html:'Your <strong>Tuition, Month 2</strong> of <strong>₦100,000</strong> is due on <strong>1 August 2026</strong>. Please sign in to your student portal to make your payment.' },
    { type:'cta', label:'Pay now', url:'#' },
    { type:'note', html:'Questions? Email admin@goallordcreativity.com' }
  ]
});

add('payment-overdue', 'Payment overdue', 'Payments', {
  preheader: 'Your tuition payment is overdue.',
  headline: 'Payment overdue',
  blocks: [
    { type:'text', html:'Hi Chioma,' },
    { type:'callout', tone:'warn', html:'Your <strong>Tuition, Month 2</strong> of <strong>₦100,000</strong> was due on <strong>1 August 2026</strong> and has not been received.' },
    { type:'text', html:'Please sign in and make your payment immediately to avoid suspension of your account.' },
    { type:'cta', label:'Pay now', url:'#' }
  ]
});

add('suspension', 'Account suspended', 'Payments', {
  preheader: 'Your student account has been suspended.',
  headline: 'Account suspended',
  blocks: [
    { type:'text', html:'Hi Chioma,' },
    { type:'callout', tone:'warn', html:'Your account has been suspended due to an overdue payment that remains unpaid.' },
    { type:'text', html:'You will not be able to access your student dashboard until the outstanding balance is settled. Please sign in and make your payment to reactivate your account.' },
    { type:'cta', label:'Settle balance and reactivate', url:'#' }
  ]
});

add('reactivation', 'Account reactivated', 'Payments', {
  preheader: 'Good news, your account is reactivated.',
  headline: 'Account reactivated',
  blocks: [
    { type:'text', html:'Hi Chioma,' },
    { type:'callout', tone:'success', html:'Your outstanding payment has been confirmed and your student account is now fully reactivated.' },
    { type:'text', html:'You can sign in and resume your studies right away.' },
    { type:'cta', label:'Log in now', url:'#' }
  ]
});

// ── Learning ─────────────────────────────────────────────────
add('class-reminder', 'Class reminder', 'Learning', {
  preheader: 'You have a class coming up.',
  headline: 'Class reminder',
  blocks: [
    { type:'text', html:'Hi Chioma,' },
    { type:'text', html:'This is a reminder about your upcoming class. Here are the details.' },
    { type:'rows', label:'Class details', rows:[['Cohort','AI Dev, Batch 3'],['Day','Wednesday, 6:00 AM'],['Topic','Building your first API']] },
    { type:'cta', label:'Open student portal', url:'#' }
  ]
});

add('flashcard-reminder', 'Flashcards due today', 'Learning', {
  preheader: "Today's flashcards are waiting.",
  headline: "Today's flashcards are waiting",
  blocks: [
    { type:'text', html:'Hi Chioma, you have not completed today\'s quiz yet. It only takes a few minutes. Finish before the day ends so it counts as done.' },
    { type:'rows', label:'Week 4 · Wednesday', rows:[['Topic','Building your first API'],['Length','10 questions, about 5 minutes']] },
    { type:'cta', label:'Do my flashcards', url:'#' },
    { type:'note', html:'Complete it today to keep your progress tracker green.' }
  ]
});

add('flashcard-missed', 'Flashcards missed', 'Learning', {
  preheader: "You missed yesterday's flashcards.",
  headline: "You missed yesterday's flashcards",
  blocks: [
    { type:'text', html:'Hi Chioma, you did not finish yesterday\'s quiz.' },
    { type:'callout', tone:'warn', html:"Good news, it's still open. A few minutes now puts it back on track." },
    { type:'rows', label:'Missed · Week 4 · Tuesday', rows:[['Topic','Working with databases'],['Length','10 questions, about 5 minutes']] },
    { type:'cta', label:'Catch up now', url:'#' }
  ]
});

add('flashcard-ready', 'Flashcards ready', 'Learning', {
  preheader: 'Your flashcards for today are ready.',
  headline: 'Your flashcards are ready',
  blocks: [
    { type:'text', html:'Hi Chioma, your flashcards for today\'s lesson are ready to practise.' },
    { type:'quote', html:'<strong style="color:#1F2430;">Topic</strong><br>Building your first API<br><br><strong style="color:#1F2430;">Summary</strong><br>Routes, request handling, and returning JSON responses.' },
    { type:'cta', label:'Practise now', url:'#' }
  ]
});

add('flashcard-day-after', 'Review flashcards', 'Learning', {
  preheader: "Review yesterday's flashcards.",
  headline: "Review yesterday's lesson",
  blocks: [
    { type:'text', html:'Hi Chioma, a quick review helps it stick. Yesterday\'s flashcards are ready when you are.' },
    { type:'quote', html:'<strong style="color:#1F2430;">Topic</strong><br>Working with databases' },
    { type:'cta', label:'Review now', url:'#' }
  ]
});

add('lecture-published', 'Lecture published', 'Learning', {
  preheader: 'A new lecture has been published.',
  headline: 'New lecture published',
  blocks: [
    { type:'text', html:'Hi Chioma, a new lecture is now available in your portal.' },
    { type:'rows', label:'Lecture', rows:[['Title','Building your first API'],['Course','AI Software Development'],['Date','9 July 2026'],['Slides','24']] },
    { type:'cta', label:'View lecture', url:'#' }
  ]
});

add('lecture-updated', 'Lecture updated', 'Learning', {
  preheader: 'A lecture you follow has been updated.',
  headline: 'Lecture updated',
  blocks: [
    { type:'text', html:'Hi Chioma, a lecture in your course has been updated with new material.' },
    { type:'rows', label:'Lecture', rows:[['Title','Building your first API'],['Course','AI Software Development'],['Slides','26']] },
    { type:'cta', label:'View lecture', url:'#' }
  ]
});

add('lecture-review', 'Lecture ready for review', 'Learning', {
  preheader: 'A lecture is ready for your review.',
  headline: 'Lecture ready for review',
  blocks: [
    { type:'text', html:'Hi David, an auto-generated lecture is ready for you to review before it publishes to students.' },
    { type:'rows', label:'Lecture', rows:[['Title','Building your first API'],['Course','AI Software Development'],['Date','9 July 2026'],['Slides','24']] },
    { type:'cta', label:'Review lecture', url:'#' }
  ]
});

add('password-reset', 'Password reset', 'Account', {
  preheader: 'Reset your Goallord Creativity password.',
  headline: 'Reset your password',
  blocks: [
    { type:'text', html:'Hi Chioma,' },
    { type:'text', html:'We received a request to reset your Student Portal password. Use the button below to set a new one. This link expires in <strong style="color:#1F2430;">1 hour</strong>.' },
    { type:'cta', label:'Reset my password', url:'#' },
    { type:'linkFallback', url:'https://goallordcreativity.com/reset-password.html?token=abc123' },
    { type:'note', html:'If you did not request this, please ignore this email. Your password will not change.' }
  ]
});

add('graduation', 'Graduation', 'Account', {
  preheader: 'Congratulations on graduating!',
  headline: 'Congratulations, Chioma 🎓',
  blocks: [
    { type:'text', html:'Hi Chioma,' },
    { type:'callout', tone:'success', html:'You have successfully graduated from the AI Software Development programme, Batch 3.' },
    { type:'text', html:'Your dedication, hard work, and creativity throughout this journey have been outstanding. You are now equipped with the skills to build an amazing career. Go forth and create.' },
    { type:'cta', label:'View your dashboard', url:'#' },
    { type:'signoff', html:'Warmly,<br><strong style="font-weight:600;">The Goallord Creativity Team</strong>' }
  ],
  footerLine:'Congratulations from all of us 🎓'
});

// ── Contact ──────────────────────────────────────────────────
add('contact-autoreply', 'Contact auto-reply', 'Contact', {
  preheader: 'We received your message.',
  headline: 'Thanks for reaching out',
  blocks: [
    { type:'text', html:'Hi Chioma,' },
    { type:'text', html:'We have received your message and will get back to you within <strong style="color:#1F2430;">24 to 48 hours</strong>.' },
    { type:'note', html:'If your matter is urgent, email us directly at hello@goallordcreativity.com' }
  ]
});

add('contact-reply', 'Contact reply', 'Contact', {
  preheader: 'A reply from Goallord Creativity.',
  headline: 'Reply from Goallord Creativity',
  blocks: [
    { type:'text', html:'Hi Chioma,' },
    { type:'quote', html:'Thanks for your interest in our corporate training. We would be glad to set up a call this week to discuss your team\'s needs and put together a tailored plan.' },
    { type:'signoff', html:'Warmly,<br><strong style="font-weight:600;">The Goallord Creativity Team</strong>' }
  ]
});

// ── Admin / internal ─────────────────────────────────────────
add('admin-new-application', 'Admin: new application', 'Admin', {
  preheader: 'A new student has applied.',
  headline: 'New application received',
  blocks: [
    { type:'text', html:'A new student has applied to Goallord Creativity Academy.' },
    { type:'rows', label:'Applicant', rows:[['Name','Chioma Okafor'],['Email','chioma.okafor@gmail.com'],['Phone','+234 801 234 5678'],['Track','AI Software Development']] },
    { type:'cta', label:'View in dashboard', url:'#' }
  ]
});

add('admin-acceptance', 'Admin: applicant accepted', 'Admin', {
  preheader: 'A student account has been created.',
  headline: 'Applicant accepted',
  blocks: [
    { type:'text', html:'A student account has been created and an acceptance email with login details has been sent to the applicant.' },
    { type:'rows', label:'Student', rows:[['Name','Chioma Okafor'],['Email','chioma.okafor@gmail.com'],['Track','AI Software Development'],['Student ID','stu_8d0a2f65']] },
    { type:'cta', label:'View in dashboard', url:'#' }
  ]
});

add('admin-contact', 'Admin: contact message', 'Admin', {
  preheader: 'New message via the website contact form.',
  headline: 'New contact message',
  blocks: [
    { type:'rows', label:'From', rows:[['Name','Chioma Okafor'],['Email','chioma.okafor@gmail.com'],['Service','Corporate training'],['Budget','₦500,000+']] },
    { type:'quote', html:'We are a team of 12 and would like to train everyone on AI tools over two weekends. Could you share options and pricing?' },
    { type:'cta', label:'Reply in dashboard', url:'#' }
  ]
});

add('admin-alert', 'Admin: ops alert', 'Admin', {
  preheader: 'Action needed on the dashboard.',
  headline: 'Bank transfer to confirm',
  blocks: [
    { type:'text', html:'A bank transfer reference was submitted for enrolment. Confirm it from the dashboard to activate the account.' },
    { type:'rows', label:'Details', rows:[['Applicant','Chioma Okafor'],['Email','chioma.okafor@gmail.com'],['Reference','TRF202607090001'],['Plan','monthly']] },
    { type:'cta', label:'Open dashboard', url:'#' }
  ]
});

// ── Write files + gallery ────────────────────────────────────
const dir = path.join(__dirname, '..', 'previews');
fs.mkdirSync(dir, { recursive: true });
for (const e of emails) fs.writeFileSync(path.join(dir, e.name + '.html'), e.html);

const groups = [...new Set(emails.map(e => e.group))];
const cards = groups.map(g => {
  const items = emails.filter(e => e.group === g).map(e => `
      <div style="background:#fff;border:1px solid #E4EAF2;border-radius:12px;overflow:hidden;">
        <div style="padding:12px 16px;border-bottom:1px solid #EEF1F6;font-weight:600;font-size:13px;color:#1F2430;display:flex;justify-content:space-between;align-items:center;">
          <span>${e.title}</span>
          <a href="${e.name}.html" target="_blank" style="color:#D66A1F;font-size:12px;text-decoration:none;">Open ↗</a>
        </div>
        <iframe src="${e.name}.html" style="width:100%;height:520px;border:0;background:#fff;" loading="lazy"></iframe>
      </div>`).join('');
  return `<h2 style="font-size:15px;letter-spacing:.4px;text-transform:uppercase;color:#6B7280;margin:34px 0 14px;">${g}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:18px;">${items}</div>`;
}).join('');

const index = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Goallord Email Previews</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
body{font-family:'Inter',system-ui,sans-serif;margin:0;background:#EDF1FA;color:#1F2430;}</style></head>
<body>
  <div style="background:#1B1E5E;padding:26px 5%;color:#fff;">
    <div style="font-size:20px;font-weight:800;">Goallord Creativity · Email Previews</div>
    <div style="color:#AEB2D8;font-size:13px;margin-top:4px;">${emails.length} templates · new Kit-style shell · sample data</div>
  </div>
  <div style="padding:8px 5% 60px;">${cards}</div>
</body></html>`;
fs.writeFileSync(path.join(dir, 'index.html'), index);

console.log(`Wrote ${emails.length} previews + index.html to previews/`);
