const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'content';

module.exports = {
  async findBySection(section) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('section', section).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },

  async findAll() {
    const { data, error } = await supabase.from(TABLE).select('id, section, updated_at');
    if (error) throw error;
    return data || [];
  },

  async upsert(section, contentData) {
    const { data, error } = await supabase
      .from(TABLE)
      .upsert({ section, data: contentData, updated_at: new Date().toISOString() }, { onConflict: 'section' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async create(doc) {
    const { data, error } = await supabase.from(TABLE).insert(clean(doc)).select().single();
    if (error) throw error;
    return data;
  },

  async count() {
    const { count, error } = await supabase.from(TABLE).select('id', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  }
};
