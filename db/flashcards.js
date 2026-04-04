const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const SETS = 'flashcard_sets';
const CARDS = 'flashcards';
const RESPONSES = 'flashcard_responses';

module.exports = {
  // Sets
  async findSets(filter = {}) {
    let q = supabase.from(SETS).select('*');
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    q = q.order('week').order('created_at');
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async findSetById(id) {
    const { data, error } = await supabase.from(SETS).select('*').eq('id', id).single();
    if (error) throw error;
    // Attach cards
    const { data: cards } = await supabase.from(CARDS).select('*').eq('set_id', id).order('order');
    data.cards = cards || [];
    return data;
  },

  async createSet(doc) {
    const { data, error } = await supabase.from(SETS).insert(clean(doc)).select().single();
    if (error) throw error;
    return data;
  },

  async updateSet(id, updates) {
    const { data, error } = await supabase.from(SETS).update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async removeSet(id) {
    const { error } = await supabase.from(SETS).delete().eq('id', id);
    if (error) throw error;
  },

  // Cards
  async findCards(setId) {
    const { data, error } = await supabase.from(CARDS).select('*').eq('set_id', setId).order('order');
    if (error) throw error;
    return data || [];
  },

  async createCard(doc) {
    const { data, error } = await supabase.from(CARDS).insert(clean(doc)).select().single();
    if (error) throw error;
    return data;
  },

  async updateCard(id, updates) {
    const { data, error } = await supabase.from(CARDS).update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async removeCard(id) {
    const { error } = await supabase.from(CARDS).delete().eq('id', id);
    if (error) throw error;
  },

  // Responses
  async createResponse(doc) {
    const { data, error } = await supabase.from(RESPONSES).insert(clean(doc)).select().single();
    if (error) throw error;
    return data;
  },

  async getProgress(studentId) {
    const { data, error } = await supabase.rpc('get_flashcard_progress', { p_student_id: studentId });
    if (error) throw error;
    return data || [];
  }
};
