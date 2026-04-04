const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'payments';

// Replaces Payment.pre('save') hook — computes status fields
function computePaymentStatus(payment) {
  const now = new Date();
  const p = { ...payment };

  if (p.category === 'full_tuition_payment' && p.amount_paid >= p.amount_due) {
    p.status = 'fully_paid';
    if (!p.paid_at) p.paid_at = now.toISOString();
  } else if (p.amount_paid >= p.amount_due) {
    p.status = 'paid';
    if (!p.paid_at) p.paid_at = now.toISOString();
  } else if (p.amount_paid > 0 && p.due_date && new Date(p.due_date) < now) {
    p.status = 'overdue';
  } else if (p.amount_paid > 0) {
    p.status = 'partially_paid';
  } else if (p.due_date && new Date(p.due_date) < now) {
    p.status = 'overdue';
  }

  return p;
}

// Replaces Payment.post('save') hook — syncs student payment status
async function syncStudentPaymentStatus(studentId) {
  try {
    const { data: payments, error } = await supabase.from(TABLE).select('status').eq('student_id', studentId);
    if (error) throw error;

    const allPaid = payments.every(p => p.status === 'paid' || p.status === 'fully_paid');
    const anyOverdue = payments.some(p => p.status === 'overdue');
    const anyPartial = payments.some(p => p.status === 'partially_paid');

    let newStatus = 'pending';
    if (allPaid && payments.length > 0) newStatus = 'paid';
    else if (anyOverdue) newStatus = 'overdue';
    else if (anyPartial) newStatus = 'partially_paid';

    await supabase.from('students').update({ payment_status: newStatus }).eq('id', studentId);
  } catch (e) {
    console.error('Failed to sync student paymentStatus:', e.message);
  }
}

// Generate receipt number
async function generateReceiptNumber() {
  const { count, error } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .neq('receipt_number', '');
  if (error) throw error;
  return 'RCP-' + new Date().getFullYear() + '-' + String((count || 0) + 1).padStart(4, '0');
}

module.exports = {
  computePaymentStatus,
  syncStudentPaymentStatus,

  async findByStudent(studentId) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('student_id', studentId).order('created_at');
    if (error) throw error;
    return data || [];
  },

  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async find({ filter = {}, populate, sort, page, limit, orFilter, inFilter, ltFilter, gtFilter, gteFilter, lteFilter, neqFilter, isNullFilter, notNullFilter } = {}) {
    let select = '*';
    if (populate === 'student') {
      select = '*, student:students(id, full_name, email, track, batch_id, payment_plan, payment_status, status)';
    } else if (populate === 'all') {
      select = '*, student:students(id, full_name, email, track, batch_id, payment_plan, payment_status, status), batch:batches(id, name, number)';
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
    if (ltFilter) {
      for (const [key, val] of Object.entries(ltFilter)) {
        q = q.lt(key, val);
      }
    }
    if (gtFilter) {
      for (const [key, val] of Object.entries(gtFilter)) {
        q = q.gt(key, val);
      }
    }
    if (gteFilter) {
      for (const [key, val] of Object.entries(gteFilter)) {
        q = q.gte(key, val);
      }
    }
    if (lteFilter) {
      for (const [key, val] of Object.entries(lteFilter)) {
        q = q.lte(key, val);
      }
    }
    if (neqFilter) {
      for (const [key, val] of Object.entries(neqFilter)) {
        q = q.neq(key, val);
      }
    }
    if (isNullFilter) {
      for (const key of isNullFilter) {
        q = q.is(key, null);
      }
    }
    if (notNullFilter) {
      for (const key of notNullFilter) {
        q = q.not(key, 'is', null);
      }
    }
    if (orFilter) {
      q = q.or(orFilter);
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
    let payment = computePaymentStatus(doc);
    if (['paid', 'fully_paid'].includes(payment.status) && !payment.receipt_number) {
      payment.receipt_number = await generateReceiptNumber();
      payment.receipt_issued_at = new Date().toISOString();
    }
    const { data, error } = await supabase.from(TABLE).insert(clean(payment)).select().single();
    if (error) throw error;
    await syncStudentPaymentStatus(data.student_id);
    return data;
  },

  async update(id, updates) {
    // If updating amounts, recompute status
    let toUpdate = { ...updates };
    if (updates.amount_paid !== undefined || updates.amount_due !== undefined) {
      const existing = await module.exports.findById(id);
      const merged = { ...existing, ...updates };
      toUpdate = computePaymentStatus(merged);
      if (['paid', 'fully_paid'].includes(toUpdate.status) && !toUpdate.receipt_number) {
        toUpdate.receipt_number = await generateReceiptNumber();
        toUpdate.receipt_issued_at = new Date().toISOString();
      }
      // Remove fields that shouldn't be in the update
      delete toUpdate.id;
      delete toUpdate.student;
      delete toUpdate.batch;
    }
    const { data, error } = await supabase.from(TABLE).update(toUpdate).eq('id', id).select().single();
    if (error) throw error;
    await syncStudentPaymentStatus(data.student_id);
    return data;
  },

  async upsert(doc, conflictCols = 'student_id,category') {
    let payment = computePaymentStatus(doc);
    if (['paid', 'fully_paid'].includes(payment.status) && !payment.receipt_number) {
      payment.receipt_number = await generateReceiptNumber();
      payment.receipt_issued_at = new Date().toISOString();
    }
    const { data, error } = await supabase.from(TABLE).upsert(payment, { onConflict: conflictCols }).select().single();
    if (error) throw error;
    await syncStudentPaymentStatus(data.student_id);
    return data;
  },

  async remove(id) {
    const payment = await module.exports.findById(id);
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
    if (payment) await syncStudentPaymentStatus(payment.student_id);
  },

  async updateMany(filter, updates) {
    let q = supabase.from(TABLE).update(updates);
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    const { data, error } = await q.select();
    if (error) throw error;
    return data || [];
  },

  async distinct(field, filter = {}) {
    let q = supabase.from(TABLE).select(field);
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    const { data, error } = await q;
    if (error) throw error;
    const unique = [...new Set((data || []).map(r => r[field]))];
    return unique;
  }
};
