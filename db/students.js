const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'students';

module.exports = {
  async findByEmail(email) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('email', email.toLowerCase()).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },

  async findById(id, opts = {}) {
    let select = '*';
    if (opts.populate === 'batch') {
      select = '*, batch:batches(id, name, number, track, is_active)';
    }
    if (opts.fields) select = opts.fields;
    const { data, error } = await supabase.from(TABLE).select(select).eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async find({ filter = {}, search, populate, sort, page, limit } = {}) {
    let select = '*';
    if (populate === 'batch') {
      select = '*, batch:batches(id, name, number, track, is_active)';
    }
    let q = supabase.from(TABLE).select(select, { count: 'exact' });

    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }

    if (search) {
      q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (sort) {
      const desc = sort.startsWith('-');
      const col = desc ? sort.slice(1) : sort;
      q = q.order(col, { ascending: !desc });
    } else {
      q = q.order('enrolled_at', { ascending: false });
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

  async count(filter = {}) {
    let q = supabase.from(TABLE).select('id', { count: 'exact', head: true });
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    const { count, error } = await q;
    if (error) throw error;
    return count || 0;
  },

  async findByBatch(batchId) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('batch_id', batchId).eq('status', 'Active');
    if (error) throw error;
    return data || [];
  }
};
