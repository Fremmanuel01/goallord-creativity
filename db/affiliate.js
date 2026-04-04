const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const LINKS = 'affiliate_links';
const CLICKS = 'affiliate_clicks';

module.exports = {
  // Links
  async findAllLinks(filter = {}) {
    let q = supabase.from(LINKS).select('*');
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    q = q.order('created_at', { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async findLinkBySlug(slug) {
    const { data, error } = await supabase.from(LINKS).select('*').eq('slug', slug).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },

  async createLink(doc) {
    const { data, error } = await supabase.from(LINKS).insert(clean(doc)).select().single();
    if (error) throw error;
    return data;
  },

  async updateLink(id, updates) {
    const { data, error } = await supabase.from(LINKS).update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async removeLink(id) {
    const { error } = await supabase.from(LINKS).delete().eq('id', id);
    if (error) throw error;
  },

  async incrementClicks(slug) {
    await supabase.rpc('increment_affiliate_clicks', { p_slug: slug });
  },

  // Clicks
  async createClick(doc) {
    const { data, error } = await supabase.from(CLICKS).insert(clean(doc)).select().single();
    if (error) throw error;
    return data;
  },

  async findClicks(filter = {}) {
    let q = supabase.from(CLICKS).select('*');
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    q = q.order('created_at', { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }
};
