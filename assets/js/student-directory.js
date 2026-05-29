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

  function avatarHtml(s) {
    var size = 'width:56px;height:56px;border-radius:50%;flex-shrink:0;';
    if (s.photo) {
      // If the photo URL fails to load, swap in an initials avatar. The name
      // is carried on data-name (already escaped) so there is no inline-JS
      // string-escaping to get wrong.
      return '<img loading="lazy" src="' + esc(s.photo) + '" alt="' + esc(s.name) +
        '" data-name="' + esc(s.name) + '" style="' + size + 'object-fit:cover;" ' +
        'onerror="GoallordDirectory._fallback(this)">';
    }
    var theme = AVATAR_THEMES[hash(s.name || s.track || 'x') % AVATAR_THEMES.length];
    return '<span style="' + size + 'display:inline-flex;align-items:center;justify-content:center;' +
      'background:linear-gradient(135deg,' + theme[0] + ',' + theme[1] + ');' +
      'color:#fff;font-weight:600;font-size:18px;letter-spacing:0.5px;">' +
      esc(initials(s.name)) + '</span>';
  }

  // Standalone node used as the <img> onerror fallback (broken photo URLs).
  function initialsNode(name) {
    var theme = AVATAR_THEMES[hash(name || 'x') % AVATAR_THEMES.length];
    var el = document.createElement('span');
    el.style.cssText = 'width:56px;height:56px;border-radius:50%;flex-shrink:0;' +
      'display:inline-flex;align-items:center;justify-content:center;' +
      'background:linear-gradient(135deg,' + theme[0] + ',' + theme[1] + ');' +
      'color:#fff;font-weight:600;font-size:18px;letter-spacing:0.5px;';
    el.textContent = initials(name);
    return el;
  }

  function cardHtml(s, type) {
    var metaBits = [];
    if (s.batchName)             metaBits.push(esc(s.batchName.toUpperCase()));
    if (type === 'alumni' && s.year) metaBits.push('CLASS OF ' + esc(s.year));
    else if (s.track)            metaBits.push(esc(s.track.toUpperCase()) + ' TRACK');
    if (s.location)              metaBits.push(esc(s.location.toUpperCase()));
    var meta = metaBits.join(' &nbsp;·&nbsp; ');

    var bio = s.bio
      ? '<p class="text-white-64 fs-14 mb-0" style="line-height:1.7;">' + esc(s.bio) + '</p>'
      : '<p class="text-white-64 fs-14 mb-0" style="line-height:1.7;opacity:.7;">' +
        (type === 'alumni'
          ? 'Proud graduate of the ' + esc(s.track || 'academy') + ' programme.'
          : 'Currently training in the ' + esc(s.track || 'academy') + ' programme.') +
        '</p>';

    var badge = (type === 'alumni')
      ? '<span class="text-caption fw-medium" style="background:rgba(214,106,31,0.14);color:var(--primary);' +
        'padding:4px 10px;border-radius:999px;font-size:11px;letter-spacing:.5px;">GRADUATE</span>'
      : '<span class="text-caption fw-medium" style="background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.7);' +
        'padding:4px 10px;border-radius:999px;font-size:11px;letter-spacing:.5px;">IN TRAINING</span>';

    return '' +
      '<div class="col-md-6 col-lg-4 gl-dir-item effectFade fadeUp" ' +
        'data-track="' + esc(s.track || '') + '" data-name="' + esc((s.name || '').toLowerCase()) + '">' +
        '<div class="wg-process gl-dir-card" style="background:var(--gl-card);border:1px solid var(--gl-border);' +
          'border-radius:8px;padding:32px 28px;height:100%;transition:border-color .3s ease,transform .3s ease;">' +
          '<div class="d-flex align-items-center justify-content-between mb-4">' +
            '<div class="d-flex align-items-center gap-3" style="min-width:0;">' +
              avatarHtml(s) +
              '<div style="min-width:0;">' +
                '<h5 class="mb-0 letter-space--2 text-truncate">' + esc(s.name) + '</h5>' +
                '<p class="text-primary text-caption fw-medium letter-space--1 mb-0">' + esc(s.track || '—') + '</p>' +
              '</div>' +
            '</div>' + badge +
          '</div>' +
          (meta ? '<p class="text-caption text-white-64 mb-3">' + meta + '</p>' : '') +
          '<div class="br-line mb-3"></div>' +
          bio +
        '</div>' +
      '</div>';
  }

  function skeleton(n) {
    var one = '<div class="col-md-6 col-lg-4">' +
      '<div style="background:var(--gl-card);border:1px solid var(--gl-border);border-radius:8px;' +
      'padding:32px 28px;height:220px;" class="gl-dir-skel"></div></div>';
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

  // <img> onerror handler: replace a broken photo with its initials avatar.
  function fallback(img) {
    try { img.replaceWith(initialsNode(img.getAttribute('data-name') || '')); }
    catch (e) { img.style.visibility = 'hidden'; }
  }

  window.GoallordDirectory = { init: init, _fallback: fallback, _initialsNode: initialsNode, _esc: esc };
})(window, document);
