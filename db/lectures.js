const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'lectures';
const LOGS = 'ai_generation_logs';

module.exports = {
  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  // The unique class slot — used for idempotent generation.
  async findSlot(batchId, week, day) {
    const { data, error } = await supabase.from(TABLE)
      .select('*').eq('batch_id', batchId).eq('week', week).eq('day', day)
      .limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },

  async create(doc) {
    const { data, error } = await supabase.from(TABLE).insert(clean(doc)).select().single();
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase.from(TABLE)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // Teacher/admin: all lectures, optionally scoped to a set of batch ids.
  async findManageable({ batchIds, batchId, status } = {}) {
    let q = supabase.from(TABLE)
      .select('*, batch:batches(id, name, track)')
      .order('lecture_date', { ascending: false, nullsFirst: false })
      .order('week', { ascending: false });
    if (batchId) q = q.eq('batch_id', batchId);
    else if (Array.isArray(batchIds)) q = q.in('batch_id', batchIds.length ? batchIds : ['00000000-0000-0000-0000-000000000000']);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  // Student: only published lectures for their batch. Never exposes working copies.
  async findPublishedForBatch(batchId) {
    const { data, error } = await supabase.from(TABLE)
      .select('id, batch_id, week, day, lecture_date, course_type, course_title, lecture_title, status, published_slides, published_notes, published_at, republished_at')
      .eq('batch_id', batchId)
      .in('status', ['published', 'republished', 'edited_after_publishing'])
      .not('published_slides', 'is', null)
      .order('lecture_date', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data || [];
  },

  async logAi(row) {
    try {
      await supabase.from(LOGS).insert(clean(row));
    } catch (e) {
      console.error('[Lectures] ai log insert failed:', e.message);
    }
  },
};
