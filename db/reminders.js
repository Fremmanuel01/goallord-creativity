const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const SETTINGS = 'reminder_settings';
const LOGS = 'reminder_logs';

module.exports = {
  // Singleton pattern for settings
  async getSettings() {
    let { data, error } = await supabase.from(SETTINGS).select('*').limit(1).maybeSingle();
    if (error) throw error;
    if (!data) {
      const result = await supabase.from(SETTINGS).insert({}).select().single();
      if (result.error) throw result.error;
      data = result.data;
    }
    return data;
  },

  async updateSettings(updates) {
    const settings = await module.exports.getSettings();
    const { data, error } = await supabase.from(SETTINGS).update(updates).eq('id', settings.id).select().single();
    if (error) throw error;
    return data;
  },

  // Logs
  async findLogs(limit = 50) {
    const { data, error } = await supabase.from(LOGS).select('*').order('sent_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },

  async createLog(doc) {
    const { data, error } = await supabase.from(LOGS).insert(clean(doc)).select().single();
    if (error) throw error;
    return data;
  }
};
