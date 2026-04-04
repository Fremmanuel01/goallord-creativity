const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'projects';
const MEMBERS = 'project_members';

module.exports = {
  async findAll(filter = {}, userId) {
    let select = '*, project_members(user:users(id, name, email, avatar))';
    let q = supabase.from(TABLE).select(select);
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    q = q.order('created_at', { ascending: false });
    let { data, error } = await q;
    if (error) throw error;

    // If userId filter, only return projects where user is a member
    if (userId) {
      data = (data || []).filter(p =>
        p.project_members && p.project_members.some(m => m.user && m.user.id === userId)
      );
    }

    // Flatten members
    for (const p of data || []) {
      p.members = (p.project_members || []).map(m => m.user).filter(Boolean);
      delete p.project_members;
    }
    return data || [];
  },

  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select('*, project_members(user:users(id, name, email, avatar))').eq('id', id).single();
    if (error) throw error;
    data.members = (data.project_members || []).map(m => m.user).filter(Boolean);
    delete data.project_members;
    return data;
  },

  async create(doc) {
    const { members, ...rest } = doc;
    const { data, error } = await supabase.from(TABLE).insert(clean(rest)).select().single();
    if (error) throw error;
    if (members && members.length > 0) {
      const rows = members.map(uid => ({ project_id: data.id, user_id: uid }));
      await supabase.from(MEMBERS).insert(rows);
    }
    return data;
  },

  async update(id, updates) {
    const { members, ...rest } = updates;
    let data;
    if (Object.keys(rest).length > 0) {
      const result = await supabase.from(TABLE).update(rest).eq('id', id).select().single();
      if (result.error) throw result.error;
      data = result.data;
    }
    if (members !== undefined) {
      await supabase.from(MEMBERS).delete().eq('project_id', id);
      if (members.length > 0) {
        const rows = members.map(uid => ({ project_id: id, user_id: uid }));
        await supabase.from(MEMBERS).insert(rows);
      }
    }
    return data || await module.exports.findById(id);
  },

  async remove(id) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  }
};
