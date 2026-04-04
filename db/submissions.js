const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'submissions';

module.exports = {
  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async find({ filter = {}, populate, sort, inFilter } = {}) {
    let select = '*';
    if (populate === 'student') {
      select = '*, student:students(id, full_name, email, profile_picture)';
    }
    let q = supabase.from(TABLE).select(select);
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
      q = q.order('submitted_at', { ascending: false });
    }
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async findDistinctStudents(assignmentId) {
    const { data, error } = await supabase.from(TABLE).select('student_id').eq('assignment_id', assignmentId);
    if (error) throw error;
    return [...new Set((data || []).map(r => r.student_id))];
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
