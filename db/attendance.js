const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'attendance';
const STUDENTS_TABLE = 'attendance_students';

module.exports = {
  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (error) throw error;
    // Attach students
    const { data: students } = await supabase.from(STUDENTS_TABLE).select('student_id, status').eq('attendance_id', id);
    data.present_students = (students || []).filter(s => s.status === 'present').map(s => s.student_id);
    data.absent_students = (students || []).filter(s => s.status === 'absent').map(s => s.student_id);
    return data;
  },

  async find({ filter = {}, populate, sort, page, limit } = {}) {
    let select = '*, batch:batches(id, name, number), taken_by_lecturer:lecturers(id, full_name)';
    let q = supabase.from(TABLE).select(select, { count: 'exact' });
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    if (sort) {
      const desc = sort.startsWith('-');
      const col = desc ? sort.slice(1) : sort;
      q = q.order(col, { ascending: !desc });
    } else {
      q = q.order('class_date', { ascending: false });
    }
    if (page && limit) {
      const from = (Number(page) - 1) * Number(limit);
      const to = from + Number(limit) - 1;
      q = q.range(from, to);
    }
    const { data, error, count } = await q;
    if (error) throw error;

    // Attach students for each record
    for (const record of data || []) {
      const { data: students } = await supabase.from(STUDENTS_TABLE).select('student_id, status').eq('attendance_id', record.id);
      record.present_students = (students || []).filter(s => s.status === 'present').map(s => s.student_id);
      record.absent_students = (students || []).filter(s => s.status === 'absent').map(s => s.student_id);
    }
    return { data: data || [], count };
  },

  async findOpenSession(batchId) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('batch_id', batchId).eq('is_open', true).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },

  async findOne(filter) {
    let q = supabase.from(TABLE).select('*');
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },

  async upsert(doc) {
    const { present_students, absent_students, ...rest } = doc;
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(rest, { onConflict: 'batch_id,week,day' })
      .select()
      .single();
    if (error) throw error;

    // Set students
    if (present_students || absent_students) {
      await supabase.from(STUDENTS_TABLE).delete().eq('attendance_id', data.id);
      const rows = [];
      if (present_students) {
        for (const sid of present_students) {
          rows.push({ attendance_id: data.id, student_id: sid, status: 'present' });
        }
      }
      if (absent_students) {
        for (const sid of absent_students) {
          rows.push({ attendance_id: data.id, student_id: sid, status: 'absent' });
        }
      }
      if (rows.length > 0) {
        await supabase.from(STUDENTS_TABLE).insert(rows);
      }
    }
    return data;
  },

  async create(doc) {
    return module.exports.upsert(doc);
  },

  async update(id, updates) {
    const { present_students, absent_students, ...rest } = updates;
    let data;
    if (Object.keys(rest).length > 0) {
      const result = await supabase.from(TABLE).update(rest).eq('id', id).select().single();
      if (result.error) throw result.error;
      data = result.data;
    }
    if (present_students !== undefined || absent_students !== undefined) {
      await supabase.from(STUDENTS_TABLE).delete().eq('attendance_id', id);
      const rows = [];
      if (present_students) {
        for (const sid of present_students) {
          rows.push({ attendance_id: id, student_id: sid, status: 'present' });
        }
      }
      if (absent_students) {
        for (const sid of absent_students) {
          rows.push({ attendance_id: id, student_id: sid, status: 'absent' });
        }
      }
      if (rows.length > 0) {
        await supabase.from(STUDENTS_TABLE).insert(rows);
      }
    }
    if (!data) data = await module.exports.findById(id);
    return data;
  },

  async markStudent(attendanceId, studentId, status) {
    await supabase.from(STUDENTS_TABLE).upsert(
      { attendance_id: attendanceId, student_id: studentId, status },
      { onConflict: 'attendance_id,student_id' }
    );
  },

  async getStudentAttendance(studentId, filter = {}) {
    const { data, error } = await supabase.from(STUDENTS_TABLE).select('attendance_id, status').eq('student_id', studentId);
    if (error) throw error;
    if (!data || data.length === 0) return [];
    const ids = data.map(r => r.attendance_id);
    let q = supabase.from(TABLE).select('*').in('id', ids);
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    const result = await q;
    if (result.error) throw result.error;
    return result.data || [];
  },

  async remove(id) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  },

  async count(filter = {}) {
    let q = supabase.from(TABLE).select('id', { count: 'exact', head: true });
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    const { count, error } = await q;
    if (error) throw error;
    return count || 0;
  }
};
