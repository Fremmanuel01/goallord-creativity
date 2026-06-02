const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'notifications';

// Fire a Web Push for a notification row, best-effort (never throws).
// Lazily required so a missing/misconfigured push setup can't break inserts.
function pushNotify(doc) {
  if (!doc || !doc.recipient_id) return;
  try {
    const push = require('../lib/push');
    if (!push.isConfigured()) return;
    push.sendToUser(doc.recipient_id, {
      title: doc.title || 'Goallord Portal',
      body:  doc.message || '',
      url:   doc.link || '/portal.html',
      tag:   doc.type || 'notification',
    }).catch(() => {});
  } catch (_) { /* push optional */ }
}

module.exports = {
  async find(filter = {}, limitCount = 50) {
    let q = supabase.from(TABLE).select('*');
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    q = q.order('created_at', { ascending: false }).limit(limitCount);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async countUnread(recipientId) {
    const { count, error } = await supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', recipientId)
      .eq('read', false);
    if (error) throw error;
    return count || 0;
  },

  async markRead(id) {
    const { data, error } = await supabase.from(TABLE).update({ read: true }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async markAllRead(recipientId) {
    const { error } = await supabase.from(TABLE).update({ read: true }).eq('recipient_id', recipientId).eq('read', false);
    if (error) throw error;
  },

  async create(doc) {
    const { data, error } = await supabase.from(TABLE).insert(clean(doc)).select().single();
    if (error) throw error;
    pushNotify(data);
    return data;
  },

  async insertMany(docs) {
    if (!docs || docs.length === 0) return [];
    const { data, error } = await supabase.from(TABLE).insert(docs).select();
    if (error) throw error;
    (data || []).forEach(pushNotify);
    return data;
  },

  async exists(filter = {}) {
    let q = supabase.from(TABLE).select('id', { count: 'exact', head: true });
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    const { count, error } = await q;
    if (error) throw error;
    return (count || 0) > 0;
  }
};
