/* ============================================================================
 * Goallord — Public Student Directory
 * Shared, dependency-free renderer for the "Our Students" (current) and
 * "Alumni" (graduated) pages. Consumes GET /api/students/directory?type=...
 *
 * Usage:
 *   GoallordDirectory.init({
 *     type:       'current' | 'alumni',
 *     gridId:     'studentsGrid',          // required — card container
 *     filterId:   'trackFilters',          // optional — track filter chips
 *     searchId:   'studentSearch',         // optional — search <input>
 *     countId:    'resultCount',           // optional — live "N students" label
 *     emptyTitle: 'No students yet',       // optional
 *     emptyText:  'Check back soon.',       // optional
 *     onLoaded:   function(students){}      // optional — for hero stats etc.
 *   });
 *
 * Security: every value coming from the API is HTML-escaped before it touches
 * the DOM. The endpoint never returns email/phone/payment data.
 * ========================================================================== */
(function (window, document) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Deterministic warm-toned gradient for initials avatars (brand palette).
  var AVATAR_THEMES = [
    ['#D66A1F', '#8a3d12'], ['#c25a2a', '#5e2a12'], ['#e08a3c', '#7a4012'],
    ['#b5521f', '#3d1c0c'], ['#d97b35', '#6b3414'], ['#a8481a', '#4a2410']
  ];
  function hash(str) {
    var h = 0, i;
    for (i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
    return Math.abs(h);
  }
  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Full-bleed gradient + large initials, used as the portrait image for
  // students without a photo (and as the broken-photo fallback). Fills its
  // parent (.feature-image) edge to edge so the grid stays uniform.
  function gradientBlock(name, track) {
    var theme = AVATAR_THEMES[hash(name || track || 'x') % AVATAR_THEMES.length];
    return '<div class="gl-dir-ph" style="position:absolute;inset:0;display:flex;align-items:center;' +
      'justify-content:center;background:linear-gradient(150deg,' + theme[0] + ' 0%,' + theme[1] + ' 100%);">' +
      '<span style="font-size:clamp(44px,7vw,72px);font-weight:600;color:rgba(255,255,255,.94);' +
      'letter-spacing:1px;line-height:1;">' + esc(initials(name)) + '</span></div>';
  }

  function photoMarkup(s) {
    if (s.photo) {
      // data-name carries the (escaped) name so the onerror handler can build
      // an initials placeholder without any inline-JS string escaping.
      return '<img loading="lazy" width="400" height="500" src="' + esc(s.photo) +
        '" alt="' + esc(s.name) + '" data-name="' + esc(s.name) +
        '" style="position:absolute;inset:0;" onerror="GoallordDirectory._fallbackImg(this)">';
    }
    return gradientBlock(s.name, s.track);
  }

  // <img> onerror → replace the broken photo with a full-bleed initials block.
  function fallbackImg(img) {
    try {
      var holder = document.createElement('div');
      holder.innerHTML = gradientBlock(img.getAttribute('data-name') || '');
      img.replaceWith(holder.firstChild);
    } catch (e) { img.style.visibility = 'hidden'; }
  }

  function cardHtml(s, type) {
    // Eyebrow tag: track + cohort, on one muted line.
    var tagBits = [];
    if (s.track) tagBits.push(esc(s.track));
    if (s.batchName) tagBits.push(esc(s.batchName));
    var tag = tagBits.join(' &nbsp;·&nbsp; ');

    // Corner badge: graduation year for alumni, batch number for current.
    var badgeText = (type === 'alumni')
      ? (s.year ? 'CLASS OF ' + esc(s.year) : 'GRADUATE')
      : (s.batchNumber != null ? 'BATCH ' + esc(s.batchNumber) : 'IN TRAINING');
    var badge =
      '<span style="position:absolute;top:16px;left:16px;z-index:2;background:rgba(8,8,8,.55);' +
      'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.14);' +
      'color:#fff;padding:6px 12px;border-radius:999px;font-size:10.5px;font-weight:600;letter-spacing:1px;">' +
      badgeText + '</span>';

    var locationLine = s.location
      ? '<p class="tag text-white-64 letter-space--1 mb-0" style="font-size:12px;opacity:.85;margin-top:6px;">' +
        '<span class="text-primary">/</span> ' + esc(s.location) + '</p>'
      : '';

    return '' +
      '<div class="col-md-6 col-lg-4 gl-dir-item effectFade fadeUp" ' +
        'data-track="' + esc(s.track || '') + '" data-name="' + esc((s.name || '').toLowerCase()) + '">' +
        '<div class="wg-feature-v01 hover-img gl-dir-card" style="height:100%;border-radius:10px;overflow:hidden;">' +
          '<div class="feature-image img-style" style="position:relative;aspect-ratio:4/5;">' +
            badge + photoMarkup(s) +
          '</div>' +
          '<div class="feature-content">' +
            '<div class="info" style="min-width:0;">' +
              (tag ? '<p class="tag text-white-64 letter-space--1">' + tag + '</p>' : '') +
              '<h5 class="name letter-space--2 mb-0">' + esc(s.name) + '</h5>' +
              locationLine +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function skeleton(n) {
    var one = '<div class="col-md-6 col-lg-4">' +
      '<div style="border-radius:10px;aspect-ratio:4/5;background:' +
      'linear-gradient(110deg,var(--gl-card) 30%,rgba(255,255,255,.05) 50%,var(--gl-card) 70%);' +
      'background-size:200% 100%;animation:glDirShimmer 1.4s ease-in-out infinite;" class="gl-dir-skel"></div></div>';
    return new Array(n).fill(one).join('');
  }

  function stateBlock(title, text) {
    return '<div style="grid-column:1/-1;text-align:center;padding:64px 20px;">' +
      '<h4 class="mb-2 letter-space--2">' + esc(title) + '</h4>' +
      '<p class="text-white-64 mb-0">' + esc(text) + '</p></div>';
  }

  function init(opts) {
    opts = opts || {};
    var type = opts.type === 'alumni' ? 'alumni' : 'current';
    var grid = document.getElementById(opts.gridId);
    if (!grid) { console.error('[directory] grid not found:', opts.gridId); return; }

    var filterWrap = opts.filterId ? document.getElementById(opts.filterId) : null;
    var searchEl   = opts.searchId ? document.getElementById(opts.searchId) : null;
    var countEl    = opts.countId  ? document.getElementById(opts.countId)  : null;

    var all = [];
    var activeTrack = 'all';

    function visible() {
      var q = (searchEl && searchEl.value || '').trim().toLowerCase();
      return all.filter(function (s) {
        if (activeTrack !== 'all' && s.track !== activeTrack) return false;
        if (q && (s.name || '').toLowerCase().indexOf(q) === -1) return false;
        return true;
      });
    }

    function render() {
      var list = visible();
      if (!all.length) {
        grid.innerHTML = stateBlock(
          opts.emptyTitle || (type === 'alumni' ? 'Our first graduates are on the way' : 'No students to show yet'),
          opts.emptyText  || (type === 'alumni'
            ? 'As soon as our pioneer cohort graduates, they will be celebrated right here.'
            : 'Enrolment is open — the next cohort will appear here once classes begin.'));
      } else if (!list.length) {
        grid.innerHTML = stateBlock('No matches', 'Try a different track or clear your search.');
      } else {
        grid.innerHTML = list.map(function (s) { return cardHtml(s, type); }).join('');
      }
      if (countEl) {
        countEl.textContent = list.length + (list.length === 1 ? ' person' : ' people');
      }
      // Re-trigger the theme's reveal animation if present.
      try {
        if (window.ScrollReveal && typeof window.ScrollReveal.refresh === 'function') window.ScrollReveal.refresh();
        grid.querySelectorAll('.effectFade').forEach(function (n) { n.classList.add('show'); });
      } catch (e) {}
    }

    function buildFilters() {
      if (!filterWrap) return;
      var tracks = [];
      all.forEach(function (s) { if (s.track && tracks.indexOf(s.track) === -1) tracks.push(s.track); });
      tracks.sort();
      if (!tracks.length) { filterWrap.innerHTML = ''; return; }
      var chips = [{ k: 'all', label: 'All' }].concat(tracks.map(function (t) { return { k: t, label: t }; }));
      filterWrap.innerHTML = chips.map(function (c) {
        var on = c.k === activeTrack;
        return '<button type="button" class="gl-dir-chip tf-btn ' + (on ? 'style-fill' : 'style-outline') +
          '" data-track="' + esc(c.k) + '" style="padding:8px 18px;' +
          (on ? '' : 'border-color:rgba(214,106,31,0.35);color:var(--primary);') + '">' +
          '<span class="text-caption fw-medium">' + esc(c.label) + '</span></button>';
      }).join('');
      filterWrap.querySelectorAll('.gl-dir-chip').forEach(function (btn) {
        btn.addEventListener('click', function () {
          activeTrack = btn.getAttribute('data-track');
          buildFilters();
          render();
        });
      });
    }

    grid.innerHTML = skeleton(opts.skeletonCount || 6);

    fetch('/api/students/directory?type=' + encodeURIComponent(type), { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (res) {
        all = (res && res.students) || [];
        buildFilters();
        render();
        if (typeof opts.onLoaded === 'function') {
          try { opts.onLoaded(all); } catch (e) { console.error(e); }
        }
      })
      .catch(function (err) {
        console.error('[directory] load failed:', err);
        grid.innerHTML = stateBlock('Could not load right now',
          'Please refresh the page in a moment. If this keeps happening, contact us.');
      });

    if (searchEl) {
      var t;
      searchEl.addEventListener('input', function () { clearTimeout(t); t = setTimeout(render, 120); });
    }
  }

  // One-time injected styles: skeleton shimmer + premium card hover lift.
  (function injectStyles() {
    if (document.getElementById('gl-dir-styles')) return;
    var css =
      '@keyframes glDirShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}' +
      '.gl-dir-card{transition:transform .45s cubic-bezier(.16,1,.3,1),box-shadow .45s ease;}' +
      '.gl-dir-item:hover .gl-dir-card{transform:translateY(-6px);' +
      'box-shadow:0 18px 40px -18px rgba(0,0,0,.7),0 0 0 1px rgba(214,106,31,.35) inset;}' +
      '.gl-dir-card .feature-content .name{transition:color .3s ease;}' +
      '.gl-dir-item:hover .gl-dir-card .name{color:var(--primary);}';
    var el = document.createElement('style');
    el.id = 'gl-dir-styles';
    el.textContent = css;
    document.head.appendChild(el);
  })();

  window.GoallordDirectory = { init: init, _fallbackImg: fallbackImg, _esc: esc };
})(window, document);
