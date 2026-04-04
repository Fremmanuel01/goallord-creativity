const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'batches';

module.exports = {
  async findAll() {
    const { data, error } = await supabase.from(TABLE).select('*').order('number', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async findActive() {
    const { data, error } = await supabase.from(TABLE).select('*').eq('is_active', true).limit(1).maybeSingle();
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
