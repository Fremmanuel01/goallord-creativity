const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'products';

module.exports = {
  async findAll(filter = {}) {
    let q = supabase.from(TABLE).select('*');
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    q = q.order('created_at', { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
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
  },

  async count() {
    const { count, error } = await supabase.from(TABLE).select('id', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  },

  async insertMany(docs) {
    // Insert one by one to avoid Supabase sending null for missing keys across mixed rows
    const results = [];
    for (const doc of docs) {
      const { data, error } = await supabase.from(TABLE).insert(clean(doc)).select().single();
      if (error) throw error;
      results.push(data);
    }
    return results;
  }
};
