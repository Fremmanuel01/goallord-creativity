const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'check_ins';

module.exports = {
  async find(filter = {}) {
    let q = supabase.from(TABLE).select('*');
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    q = q.order('created_at', { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async create(doc) {
    const { data, error } = await supabase.from(TABLE).insert(clean(doc)).select().single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  }
};
