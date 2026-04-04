const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'orders';

async function generateOrderId() {
  const { count, error } = await supabase.from(TABLE).select('id', { count: 'exact', head: true });
  if (error) throw error;
  return 'ORD-' + String((count || 0) + 1).padStart(4, '0');
}

module.exports = {
  async find({ filter = {}, populate, sort, page, limit, inFilter } = {}) {
    let select = '*';
    if (populate === 'product') {
      select = '*, product:products(id, name, category, price, image, download_url)';
    }
    let q = supabase.from(TABLE).select(select, { count: 'exact' });
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    if (inFilter) {
      for (const [key, arr] of Object.entries(inFilter)) {
        q = q.in(key, arr);
      }
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

  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select('*, product:products(id, name, category, price, image, download_url)').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async create(doc) {
    if (!doc.order_id) {
      doc.order_id = await generateOrderId();
    }
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
