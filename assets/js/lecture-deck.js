// Lecture deck renderer (shared by student + lecturer dashboards).
// Renders one slide JSON object → HTML, by layout_type. Each slide is a real
// presentation canvas: kicker + display title + short copy + visual, with
// page-number furniture. The spoken teaching (main_explanation) sits behind
// the "Explain more" panel that rises from the slide foot. image_url is used
// when present; otherwise a clean placeholder keeps the layout intact.
// Styles live in assets/css/lecture-deck.css — keep class names in sync.
(function () {
  'use strict';

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ctx: { idx (0-based current index), total, course (kicker fallback) }
  function slideHtml(s, ctx) {
    ctx = ctx || {};
    const total = ctx.total || 1;
    const anim = 'lv-anim-' + (s.animation_type && s.animation_type !== 'none' ? s.animation_type : 'fade');
    const pad2 = (n) => String(n).padStart(2, '0');
    const title = escHtml(s.slide_title || '');
    const onText = (s.on_slide_text || '').split('\n').map(t => t.trim()).filter(Boolean);
    // "Heading: body" lines become labelled items; bare lines get numerals.
    const split = (c, i) => {
      const m = c.match(/^([^:]{2,40}):\s*(.+)$/);
      return m ? { h: m[1], b: m[2] } : { h: pad2(i + 1), b: c };
    };
    const kickerText = s.slide_type && !['content', 'title'].includes(String(s.slide_type).toLowerCase())
      ? String(s.slide_type).replace(/[_-]+/g, ' ')
      : (ctx.course || 'Lecture');
    const kicker = `<div class="lv-kicker">${escHtml(kickerText)}</div>`;
    // noExplain: drop the on-slide "Explain more" panel (teach mode shows the
    // speaker notes in the presenter rail instead, so they never cover content).
    const furniture =
      (!ctx.noExplain && s.main_explanation ? `<details class="lv-expl"><summary>Explain more</summary><p>${escHtml(s.main_explanation)}</p></details>` : '') +
      `<div class="lv-num">${pad2(s.slide_number || (ctx.idx || 0) + 1)}<span> / ${pad2(total)}</span></div>`;
    const bullets = onText.length > 1
      ? `<ul class="lv-bullets">${onText.map(t => `<li><span>${escHtml(t)}</span></li>`).join('')}</ul>`
      : (onText[0] ? `<p class="lv-lede">${escHtml(onText[0])}</p>` : '');
    const img = s.image_url ? `<img src="${s.image_url}" alt="${title}" loading="lazy">` : '';
    const ph = `<div class="lv-ph"><span style="font-size:22px">◍</span>${escHtml(s.visual_description || 'Visual')}</div>`;
    const media = `<div class="lv-media">${img || ph}<div class="lv-grade"></div></div>`;
    const bleed = `<div class="lv-bleed">${img || ph}</div><div class="lv-bleed lv-scrim"></div>`;
    const foot = ctx.noExplain ? ' lv-nofoot' : '';
    const wrap = (inner, cls) => `<div class="${anim} lv-slide${foot}${cls ? ' ' + cls : ''}">${inner}${furniture}</div>`;
    const canvas = (inner, cls) => `<div class="lv-canvas${cls ? ' ' + cls : ''}">${inner}</div>`;
    const mid = (inner) => `<div style="margin:auto 0;min-width:0">${inner}</div>`;

    switch (s.layout_type) {
      case 'title':
        return wrap(
          (s.image_url ? bleed : '') +
          canvas(`<div style="margin-top:auto">
            ${kicker}
            <div class="lv-h" style="font-size:clamp(28px,6.2cqw,62px);max-width:17ch;margin-bottom:${onText.length ? 'clamp(12px,2cqw,20px)' : '0'}">${title}</div>
            ${onText.length ? `<p class="lv-lede" style="${s.image_url ? 'color:#CBD0DA' : ''}">${escHtml(onText.join(' · '))}</p>` : ''}
          </div>`, s.image_url ? 'lv-onimg' : ''),
          s.image_url ? 'lv-photo' : 'lv-warm');
      case 'full_image_overlay':
        return wrap(
          (s.image_url ? bleed : '') +
          canvas(`<div style="margin-top:auto">
            ${kicker}
            <div class="lv-h" style="font-size:clamp(24px,4.8cqw,50px);margin-bottom:${onText.length ? 'clamp(10px,1.8cqw,18px)' : '0'}">${title}</div>
            ${onText.length ? `<p class="lv-lede" style="${s.image_url ? 'color:#CBD0DA' : ''}">${escHtml(onText.join(' '))}</p>` : ''}
          </div>`, s.image_url ? 'lv-onimg' : ''),
          s.image_url ? 'lv-photo' : 'lv-warm');
      case 'image_right_text_left':
      case 'image_left_text_right': {
        const text = canvas(mid(`${kicker}<div class="lv-h" style="font-size:clamp(22px,3.8cqw,42px)">${title}</div>${bullets}`));
        return wrap(`<div class="lv-cols">${s.layout_type === 'image_left_text_right' ? media + text : text + media}</div>`);
      }
      case 'comparison': {
        const tones = ['var(--orange)', '#1E4BFF'];
        const cols = (onText.length ? onText : ['']).slice(0, 2).map(split);
        return wrap(canvas(mid(`${kicker}<div class="lv-h">${title}</div>
          <div class="lv-vs">${cols.map((c, i) => `<div>
            <b style="color:${tones[i] || tones[0]}">${escHtml(/^\d+$/.test(c.h) ? (i ? 'And' : 'Versus') : c.h)}</b>
            <span>${escHtml(c.b)}</span></div>`).join('')}</div>`)));
      }
      case 'cards_grid':
        return wrap(canvas(mid(`${kicker}<div class="lv-h">${title}</div>
          <div class="lv-tiles">${onText.map((c, i) => { const t = split(c, i);
            return `<div class="lv-tile"><b>${escHtml(t.h)}</b><span>${escHtml(t.b)}</span></div>`; }).join('')}</div>`)));
      case 'timeline':
        return wrap(canvas(mid(`${kicker}<div class="lv-h">${title}</div>
          <div class="lv-steps">${onText.map((c, i) => { const t = split(c, i);
            return `<div class="lv-step"><b>${escHtml(/^\d+$/.test(t.h) ? 'Step ' + (i + 1) : t.h)}</b><span>${escHtml(t.b)}</span></div>`; }).join('')}</div>`)));
      case 'flowchart':
        return wrap(canvas(mid(`${kicker}<div class="lv-h">${title}</div>
          <div class="lv-flow">${onText.map((t, i) =>
            `<div class="f">${escHtml(t)}</div>${i < onText.length - 1 ? '<div class="a"></div>' : ''}`).join('')}</div>`)));
      case 'diagram': {
        // Shape nodes: "Label: caption" lines become diamond + caption pairs.
        const fills = ['linear-gradient(135deg,#C25612,#E0823E)', 'linear-gradient(135deg,#1E4BFF,#5E76E8)', 'linear-gradient(135deg,#2E333D,#4A5160)', 'linear-gradient(135deg,#9C420C,#C2631F)'];
        const nodes = onText.slice(0, 5).map((c, i) => { const t = split(c, i);
          const tag = /^\d+$/.test(t.h) ? String(i + 1) : t.h;
          return `<div class="d"><div class="shape" style="background:${fills[i % fills.length]}"><b>${escHtml(tag.length > 3 ? tag.slice(0, 1).toUpperCase() : tag)}</b></div>${/^\d+$/.test(t.h) ? '' : `<b>${escHtml(t.h)}</b>`}<span>${escHtml(t.b)}</span></div>`; }).join('');
        return wrap(canvas(mid(`${kicker}<div class="lv-h">${title}</div><div class="lv-dia">${nodes}</div>`)));
      }
      case 'table': {
        // First on_slide_text line = header row; cells split on "|".
        const rows = onText.map(r => r.split('|').map(c => c.trim()).filter(Boolean));
        const head = rows.shift() || [];
        return wrap(canvas(mid(`${kicker}<div class="lv-h">${title}</div>
          <table class="lv-table"><thead><tr>${head.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)));
      }
      case 'bar_chart': {
        // "Label: 70" lines; bars scale relative to the largest value.
        const data = onText.map((c, i) => { const t = split(c, i);
          const num = parseFloat((String(t.b).match(/-?\d+(\.\d+)?/) || [0])[0]);
          return { label: /^\d+$/.test(t.h) ? t.b : t.h, raw: t.b, num: isNaN(num) ? 0 : num }; });
        const top = Math.max(1, ...data.map(d => d.num));
        return wrap(canvas(mid(`${kicker}<div class="lv-h">${title}</div>
          <div class="lv-bars">${data.map(d => `<div class="lv-bar">
            <label><span>${escHtml(d.label)}</span><b>${escHtml(String(d.raw).replace(d.label, '').replace(/^[:\s]+/, '') || d.num)}</b></label>
            <div class="tr"><div class="fl" style="width:${Math.round((d.num / top) * 100)}%"></div></div></div>`).join('')}</div>`)));
      }
      case 'pie_chart': {
        // "Label: number" lines = shares of a whole → conic-gradient donut + legend.
        const cols = ['#D66A1F', '#1E4BFF', '#2E933C', '#8A4FFF', '#C2272D', '#E0A800'];
        const data = onText.slice(0, 6).map((c, i) => { const t = split(c, i);
          const num = parseFloat((String(t.b).match(/-?\d+(\.\d+)?/) || [0])[0]);
          return { label: /^\d+$/.test(t.h) ? t.b : t.h, num: !isFinite(num) || num < 0 ? 0 : num }; });
        const sum = data.reduce((a, d) => a + d.num, 0) || 1;
        let acc = 0;
        const segs = data.map((d, i) => {
          const from = (acc / sum) * 360; acc += d.num; const to = (acc / sum) * 360;
          return `${cols[i % cols.length]} ${from.toFixed(2)}deg ${to.toFixed(2)}deg`;
        }).join(', ');
        return wrap(canvas(mid(`${kicker}<div class="lv-h">${title}</div>
          <div class="lv-pie"><div class="ring" style="background:conic-gradient(${segs})"></div>
          <div class="leg">${data.map((d, i) =>
            `<div><i style="background:${cols[i % cols.length]}"></i><span>${escHtml(d.label)}</span><b>${Math.round((d.num / sum) * 100)}%</b></div>`).join('')}</div></div>`)));
      }
      case 'stat_blocks': {
        // "BigNumber: caption" lines → oversized stat callouts.
        const items = onText.slice(0, 4).map((c, i) => split(c, i));
        return wrap(canvas(mid(`${kicker}<div class="lv-h">${title}</div>
          <div class="lv-stats">${items.map(t =>
            `<div class="lv-stat"><b>${escHtml(t.h)}</b><span>${escHtml(t.b)}</span></div>`).join('')}</div>`)));
      }
      case 'pyramid': {
        // "Label: caption" lines, top level first → stacked levels widening down.
        const fills = ['linear-gradient(135deg,#C25612,#E0823E)', 'linear-gradient(135deg,#1E4BFF,#5E76E8)', 'linear-gradient(135deg,#2E333D,#4A5160)', 'linear-gradient(135deg,#9C420C,#C2631F)', 'linear-gradient(135deg,#16489C,#2F6BD8)'];
        const lv = onText.slice(0, 5).map((c, i) => split(c, i));
        const n = lv.length;
        return wrap(canvas(mid(`${kicker}<div class="lv-h">${title}</div>
          <div class="lv-pyr">${lv.map((t, i) =>
            `<div class="lvl" style="background:${fills[i % fills.length]};width:${n > 1 ? Math.round(38 + 62 * i / (n - 1)) : 70}%">
              <b>${escHtml(/^\d+$/.test(t.h) ? t.b : t.h)}</b>${/^\d+$/.test(t.h) ? '' : `<span>${escHtml(t.b)}</span>`}</div>`).join('')}</div>`)));
      }
      case 'quote': {
        // Line 1 = the quotation, line 2 = attribution. Drenched accent slide.
        const q = (onText[0] || '').replace(/^["“]+|["”]+$/g, '');
        const by = (onText[1] || '').replace(/^[-—\s]+/, '');
        return wrap(canvas(`<div class="lv-quote">${kicker}<p>${escHtml(q)}</p>${by ? `<cite>— ${escHtml(by)}</cite>` : ''}</div>`), 'lv-warm');
      }
      case 'code_demo':
        return wrap(canvas(mid(`${kicker}<div class="lv-h" style="font-size:clamp(20px,3.4cqw,36px)">${title}</div>
          <div style="background:#101216;border:1px solid var(--pp-line);border-radius:14px;overflow:hidden;max-width:760px;box-shadow:0 10px 28px rgba(35,30,20,0.12)">
            <div style="display:flex;gap:6px;padding:11px 14px;border-bottom:1px solid #232834">
              <span style="width:10px;height:10px;border-radius:50%;background:#FF5F57"></span><span style="width:10px;height:10px;border-radius:50%;background:#FEBC2E"></span><span style="width:10px;height:10px;border-radius:50%;background:#28C840"></span>
            </div>
            <pre style="margin:0;padding:clamp(14px,2.2cqw,22px);overflow-x:auto;font-size:clamp(12.5px,1.5cqw,14.5px);line-height:1.7;color:#D6DEEB;white-space:pre-wrap">${escHtml((s.on_slide_text || '').trim())}</pre>
          </div>`)));
      case 'lesson_summary':
        return wrap(canvas(mid(`${kicker}<div class="lv-h">${title}</div>
          <ul class="lv-checks">${onText.map(t => `<li><span>${escHtml(t)}</span></li>`).join('')}</ul>`)), 'lv-warm');
      default:
        return wrap(canvas(mid(`${kicker}<div class="lv-h">${title}</div>${bullets}`)));
    }
  }

  window.LectureDeck = { slideHtml, escHtml };
})();
