const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'materials';

module.exports = {
  async find(filter = {}) {
    let q = supabase.from(TABLE).select('*');
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    q = q.order('week').order('created_at');
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async findById(id) {
    // maybeSingle: a missing/malformed id returns null (not a PGRST error),
    // so callers' `if (!doc) 404` works instead of surfacing a 500.
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  },

  async create(doc) {
    const { data, error } = await supabase.from(TABLE).insert(clean(doc)).select().single();
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase.from(TABLE).update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  }
};
