const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'team_members';

module.exports = {
  async findAll() {
    const { data, error } = await supabase.from(TABLE).select('*').order('order');
    if (error) throw error;
    return data || [];
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
