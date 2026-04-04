const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'academy_settings';

module.exports = {
  async get() {
    let { data, error } = await supabase.from(TABLE).select('*').limit(1).maybeSingle();
    if (error) throw error;
    if (!data) {
      const result = await supabase.from(TABLE).insert({}).select().single();
      if (result.error) throw result.error;
      data = result.data;
    }
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase.from(TABLE).update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async count() {
    const { count, error } = await supabase.from(TABLE).select('id', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  },

  async create(doc) {
    const { data, error } = await supabase.from(TABLE).insert(clean(doc)).select().single();
    if (error) throw error;
    return data;
  }
};
