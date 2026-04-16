const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'applicants';

module.exports = {
  async findByEmail(email) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('email', email.toLowerCase()).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },

  async findByRef(ref) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('application_fee_ref', ref).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },

  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async find({ filter = {}, sort, page, limit } = {}) {
    let q = supabase.from(TABLE).select('*', { count: 'exact' });
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    if (sort) {
      const desc = sort.startsWith('-');
      const col = desc ? sort.slice(1) : sort;
      q = q.order(col, { ascending: !desc });
    } else {
      q = q.order('created_at', { ascending: false });
    }
    if (page && limit) {
      const from = (Number(page) - 1) * Number(limit);
      const to = from + Number(limit) - 1;
      q = q.range(from, to);
    }
    const { data, error, count } = await q;
    if (error) throw error;
    return { data: data || [], count };
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
