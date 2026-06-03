// ============================================================
// chat-ui.js — reusable in-app chat widget
//
// Renders a two-pane messenger (threads + conversation) into a
// container. Works for students, lecturers and admin against the
// /api/messages API. Real-time via same-origin socket.io when
// available, with REST polling as a fallback.
//
//   initChat({
//     container: '#chatPanel',
//     base: '/api/messages',
//     token: () => localStorage.getItem('gl_student_token'),
//     self: { type: 'student', id: '…', name: 'Ada' },
//     onUnread: (n) => { … }   // optional badge callback
//   });
//
// Include AFTER csrf.js (POSTs need the CSRF header).
// ============================================================
(function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso), now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
        d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function loadSocketIo() {
    return new Promise(function (resolve) {
      if (window.io) return resolve(window.io);
      const s = document.createElement('script');
      s.src = '/socket.io/socket.io.js';
      s.onload = function () { resolve(window.io || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
  }

  window.initChat = function (opts) {
    const el = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
    if (!el) return;
    const base = opts.base;
    const self = opts.self || {};
    const tok = function () { return typeof opts.token === 'function' ? opts.token() : opts.token; };

    function api(path, method, body) {
      const headers = { 'Authorization': 'Bearer ' + tok() };
      if (body) headers['Content-Type'] = 'application/json';
      const o = { method: method || 'GET', headers: headers };
      if (body) o.body = JSON.stringify(body);
      return fetch(base + path, o).then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, json: j }; }).catch(function () { return { ok: r.ok, json: {} }; });
      });
    }

    const state = { threads: [], activeId: null, activeType: null, activeMeta: null, contacts: null, socket: null, pollT: null };

    // ── Styles (CSS vars w/ fallbacks → looks right on any dashboard) ──
    const C = {
      wrap: 'display:flex;gap:0;border:1px solid var(--border,#2A2F3A);border-radius:12px;overflow:hidden;height:72vh;min-height:420px;background:var(--card,#171A21);',
      list: 'width:300px;flex-shrink:0;border-right:1px solid var(--border,#2A2F3A);display:flex;flex-direction:column;min-width:0;',
      convo: 'flex:1;display:flex;flex-direction:column;min-width:0;',
      item: 'display:flex;gap:10px;align-items:center;padding:12px 14px;cursor:pointer;border-bottom:1px solid var(--border,#2A2F3A);',
      composer: 'display:flex;gap:8px;padding:12px;border-top:1px solid var(--border,#2A2F3A);',
      input: 'flex:1;padding:11px 14px;background:#0F1115;border:1px solid #2A2F3A;border-radius:8px;color:#F4F6FA;font-size:14px;outline:none;font-family:inherit;resize:none;',
      btn: 'padding:0 18px;background:var(--orange,#D66A1F);color:#fff;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;'
    };

    // ── Mobile single-pane behaviour ──
    // Desktop keeps the two-column layout. On phones the thread list fills the
    // width; opening a thread (or the contacts picker) slides a full-width
    // conversation pane over it, with a back button to return.
    function ensureChatStyles() {
      if (document.getElementById('gl-chat-styles')) return;
      const st = document.createElement('style');
      st.id = 'gl-chat-styles';
      st.textContent =
        '@media (max-width:640px){' +
          '.gl-chat{position:relative;height:calc(100dvh - 215px)!important;min-height:360px;}' +
          '.gl-chat > #chatList{width:100%!important;border-right:none!important;}' +
          '.gl-chat > #chatConvo{position:absolute;inset:0;z-index:2;background:var(--card,#171A21);' +
            'transform:translateX(100%);transition:transform .28s cubic-bezier(.22,.61,.36,1);}' +
          '.gl-chat.gl-chat--convo > #chatConvo{transform:translateX(0);}' +
          '.gl-chat .gl-chat-back{display:inline-flex!important;align-items:center;}' +
        '}';
      document.head.appendChild(st);
    }
    function chatWrapEl() { return el.querySelector('#chatWrap'); }
    function showConvoPane() { const w = chatWrapEl(); if (w) w.classList.add('gl-chat--convo'); }
    function showListPane() { const w = chatWrapEl(); if (w) w.classList.remove('gl-chat--convo'); }

    function avatar(name, group) {
      const initials = group ? '👥' : (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
      const bg = group ? 'rgba(30,75,255,0.18)' : 'rgba(214,106,31,0.18)';
      const col = group ? '#6a9fff' : 'var(--orange,#D66A1F)';
      return '<div style="width:38px;height:38px;border-radius:50%;background:' + bg + ';color:' + col + ';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">' + esc(initials) + '</div>';
    }

    function shell() {
      ensureChatStyles();
      el.innerHTML =
        '<div class="gl-chat" id="chatWrap" style="' + C.wrap + '">' +
          '<div style="' + C.list + '" id="chatList">' +
            '<div style="padding:12px 14px;border-bottom:1px solid var(--border,#2A2F3A);display:flex;gap:8px;align-items:center;">' +
              '<strong style="font-size:14px;flex:1;">Messages</strong>' +
              '<button id="chatNewBtn" title="New message" style="background:var(--orange,#D66A1F);color:#fff;border:none;border-radius:7px;width:30px;height:30px;font-size:18px;cursor:pointer;line-height:1;">+</button>' +
            '</div>' +
            '<div id="chatThreads" style="overflow-y:auto;flex:1;"><div style="padding:24px;color:var(--muted,#A0A6B3);font-size:13px;text-align:center;">Loading…</div></div>' +
          '</div>' +
          '<div style="' + C.convo + '" id="chatConvo">' +
            '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--muted,#A0A6B3);font-size:14px;padding:24px;text-align:center;">Select a conversation or start a new one.</div>' +
          '</div>' +
        '</div>';
      document.getElementById('chatNewBtn').onclick = openContacts;
    }

    function renderThreads() {
      const box = document.getElementById('chatThreads');
      if (!box) return;
      if (!state.threads.length) {
        box.innerHTML = '<div style="padding:24px;color:var(--muted,#A0A6B3);font-size:13px;text-align:center;">No conversations yet. Tap + to start one.</div>';
        return;
      }
      box.innerHTML = state.threads.map(function (t) {
        const active = t.id === state.activeId;
        const unread = t.unread > 0;
        return '<div class="chat-thread" data-id="' + t.id + '" data-type="' + t.type + '" style="' + C.item + (active ? 'background:rgba(255,255,255,0.04);' : '') + '">' +
          avatar(t.title, t.type === 'batch') +
          '<div style="flex:1;min-width:0;">' +
            '<div style="display:flex;gap:6px;align-items:baseline;"><span style="font-weight:' + (unread ? '700' : '600') + ';font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">' + esc(t.title || 'Conversation') + '</span>' +
              '<span style="font-size:10px;color:var(--muted,#A0A6B3);flex-shrink:0;">' + fmtTime(t.lastMessageAt) + '</span></div>' +
            '<div style="font-size:12px;color:var(--muted,#A0A6B3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(t.lastMessagePreview || (t.type === 'batch' ? 'Group chat' : 'No messages yet')) + '</div>' +
          '</div>' +
          (unread ? '<span style="background:var(--orange,#D66A1F);color:#fff;font-size:10px;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 5px;flex-shrink:0;">' + t.unread + '</span>' : '') +
        '</div>';
      }).join('');
      box.querySelectorAll('.chat-thread').forEach(function (node) {
        node.onclick = function () { openThread(node.dataset.id); };
      });
    }

    function refreshThreads() {
      return api('/threads').then(function (r) {
        if (!r.ok) return;
        state.threads = r.json || [];
        renderThreads();
        if (opts.onUnread) opts.onUnread(state.threads.reduce(function (s, t) { return s + (t.unread || 0); }, 0));
      });
    }

    function openThread(id) {
      showConvoPane();
      state.activeId = id;
      const t = state.threads.find(function (x) { return x.id === id; });
      state.activeType = t ? t.type : null;
      renderThreads();
      const convo = document.getElementById('chatConvo');
      convo.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--muted,#A0A6B3);">Loading…</div>';
      if (state.socket) state.socket.emit('chat:open', { threadId: id });
      api('/threads/' + id + '/messages').then(function (r) {
        if (!r.ok) { convo.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:#ff7070;padding:24px;">' + esc((r.json && r.json.error) || 'Could not load.') + '</div>'; return; }
        state.activeMeta = r.json.thread || {};
        renderConvo(t, r.json.messages || [], state.activeMeta);
        // The GET marks it read server-side — reflect locally.
        if (t) { t.unread = 0; renderThreads(); if (opts.onUnread) opts.onUnread(state.threads.reduce(function (s, x) { return s + (x.unread || 0); }, 0)); }
      });
    }

    function renderConvo(thread, messages, meta) {
      meta = meta || {};
      const convo = document.getElementById('chatConvo');
      const title = thread ? (thread.title || 'Conversation') : 'Conversation';
      const isGroup = thread && thread.type === 'batch';
      const announce = meta.postPolicy === 'announce';
      const canPost = meta.canPost !== false;       // default allow unless server says otherwise
      const canManage = !!meta.canManage;
      const subtitle = isGroup
        ? (announce ? 'Announcements · staff post only' : 'Batch group chat')
        : 'Direct message';

      const manageBtn = canManage
        ? '<button id="chatPolicyBtn" title="Toggle announcement-only posting" style="background:none;border:1px solid var(--border,#2A2F3A);color:var(--muted,#A0A6B3);border-radius:7px;padding:5px 10px;font-size:11px;cursor:pointer;white-space:nowrap;flex-shrink:0;">' +
            (announce ? '📢 Announce: ON' : '📢 Announce: OFF') +
          '</button>'
        : '';

      const composer = canPost
        ? '<div style="' + C.composer + '">' +
            '<textarea id="chatInput" rows="1" placeholder="Type a message…" style="' + C.input + '"></textarea>' +
            '<button id="chatSend" style="' + C.btn + '">Send</button>' +
          '</div>'
        : '<div style="padding:14px 16px;border-top:1px solid var(--border,#2A2F3A);color:var(--muted,#A0A6B3);font-size:13px;text-align:center;">🔒 Only staff can post in this announcement channel.</div>';

      convo.innerHTML =
        '<div style="padding:14px 16px;border-bottom:1px solid var(--border,#2A2F3A);display:flex;gap:10px;align-items:center;">' +
          '<button id="chatBack" class="gl-chat-back" style="background:none;border:none;color:var(--muted,#A0A6B3);font-size:22px;cursor:pointer;display:none;padding:0 4px;line-height:1;">‹</button>' +
          avatar(title, isGroup) +
          '<div style="min-width:0;flex:1;"><div style="font-weight:700;font-size:14px;">' + esc(title) + '</div>' +
          '<div style="font-size:11px;color:var(--muted,#A0A6B3);">' + subtitle + '</div></div>' +
          manageBtn +
        '</div>' +
        '<div id="chatMsgs" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;"></div>' +
        composer;
      renderMessages(messages);

      const pb = document.getElementById('chatPolicyBtn');
      if (pb) pb.onclick = function () {
        const next = (state.activeMeta && state.activeMeta.postPolicy === 'announce') ? 'open' : 'announce';
        pb.disabled = true;
        api('/threads/' + state.activeId + '/policy', 'POST', { policy: next }).then(function (r) {
          if (!r.ok) { pb.disabled = false; return; }
          openThread(state.activeId); // re-fetch meta + messages, re-render
        });
      };

      if (canPost) {
        const input = document.getElementById('chatInput');
        const send = function () {
          const body = input.value.trim();
          if (!body) return;
          input.value = '';
          api('/threads/' + state.activeId + '/messages', 'POST', { body: body }).then(function (r) {
            if (!r.ok) { input.value = body; return; }
            appendMessage(r.json);
            const t = state.threads.find(function (x) { return x.id === state.activeId; });
            if (t) { t.lastMessageAt = r.json.created_at; t.lastMessagePreview = body; renderThreads(); }
          });
        };
        document.getElementById('chatSend').onclick = send;
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        });
        input.focus();
      }

      const back = document.getElementById('chatBack');
      if (back) back.onclick = showListPane;
    }

    function renderMessages(messages) {
      const box = document.getElementById('chatMsgs');
      if (!box) return;
      box.innerHTML = messages.map(messageHtml).join('') ||
        '<div style="margin:auto;color:var(--muted,#A0A6B3);font-size:13px;">No messages yet. Say hello 👋</div>';
      box.scrollTop = box.scrollHeight;
    }

    function messageHtml(m) {
      const mine = m.sender_type === self.type && m.sender_id === self.id;
      const bubble = mine
        ? 'background:var(--orange,#D66A1F);color:#fff;border-radius:12px 12px 4px 12px;align-self:flex-end;'
        : 'background:rgba(255,255,255,0.05);color:var(--text,#F4F6FA);border-radius:12px 12px 12px 4px;align-self:flex-start;';
      const showName = !mine && state.activeType === 'batch';
      return '<div style="max-width:78%;' + bubble + 'padding:9px 13px;">' +
        (showName ? '<div style="font-size:11px;font-weight:700;color:#6a9fff;margin-bottom:3px;">' + esc(m.sender_name) + '</div>' : '') +
        '<div style="font-size:14px;line-height:1.45;white-space:pre-wrap;word-break:break-word;">' + esc(m.body) + '</div>' +
        '<div style="font-size:10px;opacity:.7;margin-top:4px;text-align:right;">' + fmtTime(m.created_at) + '</div>' +
      '</div>';
    }

    function appendMessage(m) {
      const box = document.getElementById('chatMsgs');
      if (!box) return;
      const empty = box.querySelector('div[style*="margin:auto"]');
      if (empty) box.innerHTML = '';
      box.insertAdjacentHTML('beforeend', messageHtml(m));
      box.scrollTop = box.scrollHeight;
    }

    function openContacts() {
      showConvoPane();
      const convo = document.getElementById('chatConvo');
      convo.innerHTML =
        '<div style="padding:14px 16px;border-bottom:1px solid var(--border,#2A2F3A);display:flex;gap:8px;align-items:center;">' +
          '<button class="gl-chat-back" id="chatContactsBack" style="background:none;border:none;color:var(--muted,#A0A6B3);font-size:22px;cursor:pointer;display:none;padding:0 4px;line-height:1;">‹</button>' +
          '<div style="font-weight:700;font-size:15px;flex:1;">Start a conversation</div>' +
        '</div>' +
        '<div id="chatContacts" style="padding:14px 16px;overflow-y:auto;flex:1;color:var(--muted,#A0A6B3);font-size:13px;">Loading…</div>';
      const cb = document.getElementById('chatContactsBack');
      if (cb) cb.onclick = showListPane;
      const fill = function () {
        const box = document.getElementById('chatContacts');
        const people = (state.contacts && state.contacts.people) || [];
        if (!people.length) { box.innerHTML = 'No contacts available yet.'; return; }
        box.innerHTML = people.map(function (p) {
          return '<div class="chat-contact" data-type="' + p.type + '" data-id="' + p.id + '" style="' + C.item + 'border:1px solid var(--border,#2A2F3A);border-radius:10px;margin-bottom:8px;">' +
            avatar(p.name, false) +
            '<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:13px;">' + esc(p.name) + '</div>' +
            '<div style="font-size:12px;color:var(--muted,#A0A6B3);">' + esc(p.sub || '') + '</div></div></div>';
        }).join('');
        box.querySelectorAll('.chat-contact').forEach(function (node) {
          node.onclick = function () {
            api('/dm', 'POST', { withType: node.dataset.type, withId: node.dataset.id }).then(function (r) {
              if (!r.ok) return;
              refreshThreads().then(function () { openThread(r.json.id); });
            });
          };
        });
      };
      if (state.contacts) fill();
      else api('/contacts').then(function (r) { state.contacts = r.ok ? r.json : { people: [], batches: [] }; fill(); });
    }

    // ── Real-time + polling ──
    function startRealtime() {
      loadSocketIo().then(function (io) {
        if (!io) return; // polling only
        try {
          const socket = io({ transports: ['websocket', 'polling'] });
          state.socket = socket;
          socket.on('connect', function () { socket.emit('chat:join', { token: tok() }); if (state.activeId) socket.emit('chat:open', { threadId: state.activeId }); });
          socket.on('chat:message', function (m) {
            if (m.thread_id === state.activeId) {
              const mine = m.sender_type === self.type && m.sender_id === self.id;
              if (!mine) appendMessage(m);
            } else {
              refreshThreads();
            }
          });
          socket.on('chat:thread-updated', function () { refreshThreads(); });
          socket.on('chat:policy', function (p) { if (p && p.threadId === state.activeId) openThread(state.activeId); });
        } catch (e) { /* fall back to polling */ }
      });
      // Safety-net poll for the thread list (unread badge) regardless of socket.
      state.pollT = setInterval(refreshThreads, 15000);
    }

    // ── Boot ──
    shell();
    refreshThreads();
    api('/contacts').then(function (r) { state.contacts = r.ok ? r.json : { people: [], batches: [] }; });
    startRealtime();
  };
})();
