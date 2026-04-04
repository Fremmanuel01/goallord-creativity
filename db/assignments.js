const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'assignments';

module.exports = {
  async findById(id, opts = {}) {
    let select = '*';
    if (opts.populate === 'lecturer') {
      select = '*, lecturer:lecturers(id, full_name, email)';
    }
    const { data, error } = await supabase.from(TABLE).select(select).eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async find({ filter = {}, populate, sort } = {}) {
    let select = '*';
    if (populate === 'lecturer') {
      select = '*, lecturer:lecturers(id, full_name, email)';
    }
    let q = supabase.from(TABLE).select(select);
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    if (sort) {
      for (const s of sort) {
        const desc = s.startsWith('-');
        const col = desc ? s.slice(1) : s;
        q = q.order(col, { ascending: !desc });
      }
    } else {
      q = q.order('week').order('deadline');
    }
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async findUpcoming(hoursAhead = 24) {
    const now = new Date().toISOString();
    const future = new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('published', true)
      .gte('deadline', now)
      .lte('deadline', future);
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
