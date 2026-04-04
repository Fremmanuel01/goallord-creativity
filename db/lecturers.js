const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'lecturers';

module.exports = {
  async findByEmail(email) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('email', email.toLowerCase()).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },

  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (error) throw error;
    // Attach batches
    const { data: lb } = await supabase.from('lecturer_batches').select('batch:batches(*)').eq('lecturer_id', id);
    data.batches = (lb || []).map(r => r.batch);
    return data;
  },

  async findAll() {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, full_name, email, phone, profile_picture, bio, specialization, status, created_at')
      .order('full_name');
    if (error) throw error;
    // Attach batches for each lecturer
    for (const lec of data || []) {
      const { data: lb } = await supabase.from('lecturer_batches').select('batch:batches(*)').eq('lecturer_id', lec.id);
      lec.batches = (lb || []).map(r => r.batch);
    }
    return data || [];
  },

  async create(doc) {
    const { batches, ...rest } = doc;
    const { data, error } = await supabase.from(TABLE).insert(clean(rest)).select().single();
    if (error) throw error;
    if (batches && batches.length > 0) {
      const rows = batches.map(bId => ({ lecturer_id: data.id, batch_id: bId }));
      await supabase.from('lecturer_batches').insert(rows);
    }
    return data;
  },

  async update(id, updates) {
    const { batches, ...rest } = updates;
    let data;
    if (Object.keys(rest).length > 0) {
      const result = await supabase.from(TABLE).update(rest).eq('id', id).select().single();
      if (result.error) throw result.error;
      data = result.data;
    }
    if (batches !== undefined) {
      await supabase.from('lecturer_batches').delete().eq('lecturer_id', id);
      if (batches.length > 0) {
        const rows = batches.map(bId => ({ lecturer_id: id, batch_id: bId }));
        await supabase.from('lecturer_batches').insert(rows);
      }
    }
    if (!data) {
      data = await module.exports.findById(id);
    }
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
  }
};
