const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'notifications';

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
    return data;
  },

  async insertMany(docs) {
    if (!docs || docs.length === 0) return [];
    const { data, error } = await supabase.from(TABLE).insert(docs).select();
    if (error) throw error;
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
