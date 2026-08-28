// Shared email shell — the single Kit-style layout every transactional email
// inherits. Full-width navy header/footer bands, white letter-style body,
// orange accents, Inter typography. No em-dashes in any copy.
//
// Templates describe their content as data (a headline + an array of blocks)
// and this module renders the HTML. To restyle every email at once, edit BRAND
// or the block renderers here — nothing else changes.

const BRAND = {
  navy:   '#1B1E5E',
  orange: '#D66A1F',
  ink:    '#1F2430',
  body:   '#3C4250',
  muted:  '#6B7280',
  faint:  '#9CA3AF',
  line:   '#EEF1F6',
  panelBg:  '#F7F9FD',
  panelLine:'#E9EEF6',
  white:  '#FFFFFF',
  gold:   '#F4B36A',
  footerMuted: '#AEB2D8',
  footerFaint: '#7C81B0',
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
};

const TONES = {
  success: { bg: '#F0FAF4', line: '#D3EFDF', text: '#15683B', dot: '#16A34A' },
  warn:    { bg: '#FEF3F2', line: '#FADAD7', text: '#B42318', dot: '#EF4444' },
  info:    { bg: '#F7F9FD', line: '#E9EEF6', text: '#33415C', dot: '#1B1E5E' }
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Block renderers ──────────────────────────────────────────
function bText(html) {
  return `<p style="margin:0 0 20px;color:${BRAND.body};font-size:16px;line-height:1.75;">${html}</p>`;
}

function bHeading(text) {
  return `<p style="margin:26px 0 12px;color:${BRAND.ink};font-size:16px;font-weight:700;">${esc(text)}</p>`;
}

function bRows(rows, label) {
  const head = label
    ? `<p style="margin:0 0 12px;color:${BRAND.ink};font-size:14px;font-weight:700;letter-spacing:.2px;">${esc(label)}</p>` : '';
  const body = rows.map(([k, v], i) => `
    <tr>
      <td style="padding:13px 0;${i ? `border-top:1px solid ${BRAND.line};` : ''}color:${BRAND.muted};font-size:15px;">${esc(k)}</td>
      <td align="right" style="padding:13px 0;${i ? `border-top:1px solid ${BRAND.line};` : ''}color:${BRAND.ink};font-size:15px;font-weight:600;">${v}</td>
    </tr>`).join('');
  return `${head}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px;">${body}</table>`;
}

function bList(items) {
  const rows = items.map(it => `
    <tr><td style="padding:5px 0;color:${BRAND.body};font-size:15px;line-height:1.55;"><span style="color:${BRAND.orange};font-weight:700;">&bull;</span>&nbsp;&nbsp;${esc(it)}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">${rows}</table>`;
}

function bCallout(tone, html) {
  const t = TONES[tone] || TONES.info;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.bg};border:1px solid ${t.line};border-radius:12px;margin:0 0 30px;">
    <tr>
      <td width="46" style="padding:15px 0 15px 20px;vertical-align:middle;"><div style="width:24px;height:24px;background:${t.dot};border-radius:50%;color:#fff;font-size:14px;font-weight:700;text-align:center;line-height:24px;">!</div></td>
      <td style="padding:15px 20px 15px 12px;vertical-align:middle;color:${t.text};font-size:14px;font-weight:500;line-height:1.55;">${html}</td>
    </tr></table>`;
}

// A bordered panel with an uppercase label and label/value rows. The `mono`
// value (e.g. a password) renders in a chip. Used for credentials/details.
function bPanel({ label, rows = [], mono }) {
  const lines = rows.map(([k, v]) => `
    <tr>
      <td style="padding:6px 0;color:${BRAND.muted};font-size:15px;width:100px;vertical-align:middle;">${esc(k)}</td>
      <td style="padding:6px 0;color:${BRAND.ink};font-size:15px;font-weight:500;">${v}</td>
    </tr>`).join('');
  const monoRow = mono ? `
    <tr>
      <td style="padding:10px 0 0;color:${BRAND.muted};font-size:15px;vertical-align:middle;">${esc(mono.label)}</td>
      <td style="padding:10px 0 0;"><span style="display:inline-block;background:${BRAND.white};border:1px solid #E4EAF3;border-radius:6px;padding:7px 14px;color:${BRAND.ink};font-size:15px;font-weight:600;font-family:'SF Mono',Consolas,monospace;letter-spacing:1px;">${esc(mono.value)}</span></td>
    </tr>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.panelBg};border:1px solid ${BRAND.panelLine};border-radius:12px;margin:0 0 14px;">
    <tr><td style="padding:24px 26px;">
      ${label ? `<p style="margin:0 0 18px;color:#9099A8;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">${esc(label)}</p>` : ''}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lines}${monoRow}</table>
    </td></tr></table>`;
}

// Receipt / invoice: meta rows on top, line items, bold total.
function bReceipt({ meta = [], items = [], total }) {
  const metaRows = meta.map(([k, v], i) => `
    <tr>
      <td style="padding:11px 0;${i ? `border-top:1px solid ${BRAND.line};` : ''}color:${BRAND.muted};font-size:14px;">${esc(k)}</td>
      <td align="right" style="padding:11px 0;${i ? `border-top:1px solid ${BRAND.line};` : ''}color:${BRAND.ink};font-size:14px;font-weight:600;">${v}</td>
    </tr>`).join('');
  const itemRows = items.map(([d, a]) => `
    <tr>
      <td style="padding:14px 18px;border-top:1px solid ${BRAND.panelLine};color:${BRAND.ink};font-size:15px;">${esc(d)}</td>
      <td align="right" style="padding:14px 18px;border-top:1px solid ${BRAND.panelLine};color:${BRAND.ink};font-size:15px;font-weight:600;">${esc(a)}</td>
    </tr>`).join('');
  return `
    ${meta.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">${metaRows}</table>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.panelBg};border:1px solid ${BRAND.panelLine};border-radius:12px;overflow:hidden;margin:0 0 30px;">
      <tr><td style="padding:11px 18px;color:${BRAND.muted};font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;">Description</td>
          <td align="right" style="padding:11px 18px;color:${BRAND.muted};font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;">Amount</td></tr>
      ${itemRows}
      <tr><td style="padding:15px 18px;border-top:2px solid #E1E6EF;color:${BRAND.ink};font-size:15px;font-weight:700;">Total</td>
          <td align="right" style="padding:15px 18px;border-top:2px solid #E1E6EF;color:${BRAND.orange};font-size:17px;font-weight:800;">${esc(total)}</td></tr>
    </table>`;
}

function bQuote(html) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.panelBg};border:1px solid ${BRAND.panelLine};border-left:3px solid ${BRAND.orange};border-radius:10px;margin:0 0 30px;">
    <tr><td style="padding:20px 24px;color:${BRAND.body};font-size:15px;line-height:1.7;">${html}</td></tr></table>`;
}

function bCta(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 34px;"><tr><td style="border-radius:10px;background:${BRAND.orange};">
    <a href="${url}" style="display:inline-block;color:#FFFFFF;text-decoration:none;padding:16px 42px;font-weight:600;font-size:16px;">${esc(label)} &rarr;</a>
  </td></tr></table>`;
}

function bLinkFallback(url) {
  return `<p style="margin:0 0 24px;color:${BRAND.faint};font-size:13px;line-height:1.6;word-break:break-all;">Or paste this link into your browser:<br><a href="${url}" style="color:${BRAND.orange};text-decoration:none;">${esc(url)}</a></p>`;
}

function bNote(html) {
  return `<p style="margin:0 0 26px;color:${BRAND.faint};font-size:13px;line-height:1.6;">${html}</p>`;
}

function renderBlock(b) {
  switch (b.type) {
    case 'text':        return bText(b.html);
    case 'heading':     return bHeading(b.text);
    case 'rows':        return bRows(b.rows, b.label);
    case 'list':        return bList(b.items);
    case 'callout':     return bCallout(b.tone, b.html);
    case 'panel':       return bPanel(b);
    case 'receipt':     return bReceipt(b);
    case 'quote':       return bQuote(b.html);
    case 'cta':         return bCta(b.label, b.url);
    case 'linkFallback':return bLinkFallback(b.url);
    case 'note':        return bNote(b.html);
    case 'signoff':     return `<p style="margin:22px 0 0;color:${BRAND.ink};font-size:16px;line-height:1.6;">${b.html}</p>`;
    default:            return '';
  }
}

// ── Master renderer ──────────────────────────────────────────
// opts: { preheader, logoUrl, headline, blocks:[], footerLine, footerNote }
function renderEmail(opts = {}) {
  const {
    preheader = '', logoUrl = '', headline = '', blocks = [],
    footerLine = '', footerNote = "You're receiving this email from Goallord Creativity Academy."
  } = opts;

  const body = blocks.map(renderBlock).join('\n');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light">
<title>${esc(headline || 'Goallord Creativity Academy')}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  body,table,td,p,h1,a,span,div,li{font-family:${BRAND.font} !important;}
</style></head>
<body style="margin:0;padding:0;background:${BRAND.white};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BRAND.white};">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:${BRAND.white};">

    <tr><td style="background:${BRAND.navy};padding:52px 8% 58px;text-align:center;">
      ${logoUrl ? `<img src="${logoUrl}" alt="Goallord Creativity Academy" width="140" style="display:inline-block;width:140px;height:auto;border:0;outline:none;text-decoration:none;margin-bottom:30px;">` : ''}
      <h1 style="margin:0;color:#FFFFFF;font-size:38px;line-height:1.18;font-weight:800;letter-spacing:-0.02em;">${headline}</h1>
    </td></tr>

    <tr><td style="background:${BRAND.white};padding:50px 8% 14px;">
      ${body}
      <div style="height:36px;line-height:36px;font-size:0;">&nbsp;</div>
    </td></tr>

    <tr><td style="background:${BRAND.navy};padding:34px 8%;text-align:center;">
      ${footerLine ? `<p style="margin:0 0 8px;color:${BRAND.gold};font-size:14px;font-weight:600;line-height:1.6;">${footerLine}</p>` : ''}
      <p style="margin:0 0 14px;color:${BRAND.footerMuted};font-size:13px;line-height:1.7;">Onitsha, Nigeria &nbsp;&middot;&nbsp; <a href="mailto:admin@goallordcreativity.com" style="color:#FFFFFF;text-decoration:none;">admin@goallordcreativity.com</a></p>
      <p style="margin:0;color:${BRAND.footerFaint};font-size:11.5px;line-height:1.6;">${esc(footerNote)}</p>
    </td></tr>

  </table>
</body></html>`;
}

module.exports = { renderEmail, esc, BRAND };
