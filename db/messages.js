const supabase = require('../lib/supabase');

// In-app chat: student ↔ lecturer DMs + per-batch group threads.
// All ids are UUIDs from distinct tables, so a sender_id is globally unique
// across user types — we rely on that for "not me" unread filtering.

const THREADS = 'chat_threads';
const PARTS   = 'chat_participants';
const MSGS    = 'chat_messages';

// Deterministic key for a DM pair, order-independent.
function dmKey(a, b) {
  return [`${a.type}:${a.id}`, `${b.type}:${b.id}`].sort().join('|');
}

async function ensureParticipant(threadId, user) {
  await supabase.from(PARTS).upsert({
    thread_id: threadId,
    user_type: user.type,
    user_id: user.id,
    user_name: user.name || ''
  }, { onConflict: 'thread_id,user_type,user_id', ignoreDuplicates: true });
}

// Pure policy check: may `user` post into `thread`?
// Students are read-only in 'announce' batch threads; everyone else may post.
function canPostToThread(user, thread) {
  if (!thread) return false;
  if (thread.type === 'batch' && thread.post_policy === 'announce' && user.type === 'student') {
    return false;
  }
  return true;
}

module.exports = {
  dmKey,
  ensureParticipant,
  canPostToThread,

  async setPostPolicy(threadId, policy) {
    const { data, error } = await supabase.from(THREADS)
      .update({ post_policy: policy }).eq('id', threadId).select().single();
    if (error) throw error;
    return data;
  },

  async getThread(id) {
    const { data, error } = await supabase.from(THREADS).select('*').eq('id', id).single();
    if (error) return null;
    return data;
  },

  async getParticipants(threadId) {
    const { data } = await supabase.from(PARTS).select('*').eq('thread_id', threadId);
    return data || [];
  },

  async isParticipant(threadId, user) {
    const { data } = await supabase.from(PARTS).select('thread_id')
      .eq('thread_id', threadId).eq('user_type', user.type).eq('user_id', user.id).limit(1);
    return !!(data && data.length);
  },

  // May `user` access `threadId`? DM → must be a participant; batch → must
  // belong to that batch. Used to gate Socket.IO room joins (mirrors the REST
  // authorizeThread guard in routes/messages.js).
  async canAccessThread(user, threadId) {
    const thread = await module.exports.getThread(threadId);
    if (!thread) return false;
    if (thread.type === 'dm') return module.exports.isParticipant(threadId, user);
    // batch thread
    if (user.type === 'admin') return true;
    if (user.type === 'lecturer') {
      const { data } = await supabase.from('lecturer_batches').select('lecturer_id')
        .eq('lecturer_id', user.id).eq('batch_id', thread.batch_id).limit(1);
      return !!(data && data.length);
    }
    if (user.type === 'student') {
      const { data } = await supabase.from('students').select('batch_id').eq('id', user.id).single();
      return !!(data && data.batch_id && data.batch_id === thread.batch_id);
    }
    return false;
  },

  // Find or create the 1:1 DM thread between two users; ensures both join rows.
  async ensureDmThread(a, b) {
    const key = dmKey(a, b);
    let { data: existing } = await supabase.from(THREADS).select('*').eq('dm_key', key).limit(1);
    let thread = existing && existing[0];
    if (!thread) {
      const ins = await supabase.from(THREADS)
        .insert({ type: 'dm', dm_key: key, title: '' }).select().single();
      if (ins.error) {
        // Lost a create race — fetch the winner.
        const { data: again } = await supabase.from(THREADS).select('*').eq('dm_key', key).limit(1);
        thread = again && again[0];
        if (!thread) throw ins.error;
      } else {
        thread = ins.data;
      }
    }
    await ensureParticipant(thread.id, a);
    await ensureParticipant(thread.id, b);
    return thread;
  },

  // Find or create the group thread for a batch.
  async ensureBatchThread(batchId, batchName) {
    let { data: existing } = await supabase.from(THREADS).select('*')
      .eq('type', 'batch').eq('batch_id', batchId).limit(1);
    let thread = existing && existing[0];
    if (!thread) {
      const ins = await supabase.from(THREADS)
        .insert({ type: 'batch', batch_id: batchId, title: (batchName || 'Batch') + ' — Group Chat' })
        .select().single();
      if (ins.error) {
        const { data: again } = await supabase.from(THREADS).select('*')
          .eq('type', 'batch').eq('batch_id', batchId).limit(1);
        thread = again && again[0];
        if (!thread) throw ins.error;
      } else {
        thread = ins.data;
      }
    }
    return thread;
  },

  async addMessage(threadId, sender, body) {
    const { data, error } = await supabase.from(MSGS).insert({
      thread_id: threadId,
      sender_type: sender.type,
      sender_id: sender.id,
      sender_name: sender.name || '',
      body
    }).select().single();
    if (error) throw error;
    await supabase.from(THREADS).update({
      last_message_at: data.created_at,
      last_message_preview: body.slice(0, 140)
    }).eq('id', threadId);
    // Sender has implicitly read up to their own message.
    await supabase.from(PARTS).update({ last_read_at: data.created_at })
      .eq('thread_id', threadId).eq('user_type', sender.type).eq('user_id', sender.id);
    return data;
  },

  async getMessages(threadId, { before, limit = 40 } = {}) {
    let q = supabase.from(MSGS).select('*').eq('thread_id', threadId)
      .order('created_at', { ascending: false }).limit(Math.min(100, limit));
    if (before) q = q.lt('created_at', before);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).reverse(); // chronological
  },

  async markRead(threadId, user) {
    await ensureParticipant(threadId, user);
    await supabase.from(PARTS).update({ last_read_at: new Date().toISOString() })
      .eq('thread_id', threadId).eq('user_type', user.type).eq('user_id', user.id);
  },

  // Unread count in a thread for a user since their last_read_at (excludes own messages).
  async unreadCount(threadId, user, lastReadAt) {
    let q = supabase.from(MSGS).select('id', { count: 'exact', head: true })
      .eq('thread_id', threadId).neq('sender_id', user.id);
    if (lastReadAt) q = q.gt('created_at', lastReadAt);
    const { count } = await q;
    return count || 0;
  },

  // List all threads visible to a user: their DM threads + the group thread for
  // each accessible batch. Returns enriched objects with unread + display title.
  async listThreads(user, batches /* [{id,name}] */) {
    // DM threads via participant rows
    const { data: myParts } = await supabase.from(PARTS).select('thread_id, last_read_at')
      .eq('user_type', user.type).eq('user_id', user.id);
    const readMap = {};
    (myParts || []).forEach(p => { readMap[p.thread_id] = p.last_read_at; });
    const dmThreadIds = (myParts || []).map(p => p.thread_id);

    let dmThreads = [];
    if (dmThreadIds.length) {
      const { data } = await supabase.from(THREADS).select('*').in('id', dmThreadIds).eq('type', 'dm');
      dmThreads = data || [];
    }

    // Batch group threads (ensure they exist + a participant row for read tracking)
    const batchThreads = [];
    for (const b of (batches || [])) {
      const t = await module.exports.ensureBatchThread(b.id, b.name);
      await ensureParticipant(t.id, user);
      if (readMap[t.id] === undefined) {
        const { data: pr } = await supabase.from(PARTS).select('last_read_at')
          .eq('thread_id', t.id).eq('user_type', user.type).eq('user_id', user.id).limit(1);
        readMap[t.id] = pr && pr[0] ? pr[0].last_read_at : null;
      }
      batchThreads.push(t);
    }

    const all = [...dmThreads, ...batchThreads];

    // Enrich: title (other party for DMs), unread count.
    const enriched = [];
    for (const t of all) {
      let title = t.title;
      let counterpart = null;
      if (t.type === 'dm') {
        const parts = await module.exports.getParticipants(t.id);
        const other = parts.find(p => !(p.user_type === user.type && p.user_id === user.id));
        counterpart = other ? { type: other.user_type, id: other.user_id, name: other.user_name } : null;
        title = other ? other.user_name : 'Conversation';
      }
      const unread = await module.exports.unreadCount(t.id, user, readMap[t.id]);
      enriched.push({
        id: t.id, type: t.type, title,
        counterpart,
        batchId: t.batch_id || null,
        lastMessageAt: t.last_message_at,
        lastMessagePreview: t.last_message_preview,
        unread
      });
    }

    enriched.sort((x, y) => {
      const tx = x.lastMessageAt ? new Date(x.lastMessageAt).getTime() : 0;
      const ty = y.lastMessageAt ? new Date(y.lastMessageAt).getTime() : 0;
      return ty - tx;
    });
    return enriched;
  },

  async unreadTotal(user, batches) {
    const threads = await module.exports.listThreads(user, batches);
    return threads.reduce((s, t) => s + (t.unread || 0), 0);
  }
};
