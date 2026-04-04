const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'users';

module.exports = {
  async findByEmail(email) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('email', email.toLowerCase()).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },

  async findById(id, fields) {
    const select = fields || '*';
    const { data, error } = await supabase.from(TABLE).select(select).eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async findAll(fields) {
    const select = fields || 'id, name, email, role, permissions, avatar, created_at';
    const { data, error } = await supabase.from(TABLE).select(select).order('name');
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

  async findByResetToken(token) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('reset_token', token)
      .gt('reset_expires', new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async count(filter) {
    let q = supabase.from(TABLE).select('id', { count: 'exact', head: true });
    if (filter) {
      for (const [key, val] of Object.entries(filter)) {
        q = q.eq(key, val);
      }
    }
    const { count, error } = await q;
    if (error) throw error;
    return count || 0;
  }
};
