const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'tasks';
const COMMENTS = 'task_comments';
const DEPS = 'task_dependencies';

module.exports = {
  async find({ filter = {}, search, sort } = {}) {
    let select = '*, assignee:users!tasks_assignee_id_fkey(id, name, email, avatar), project:projects(id, name, color)';
    let q = supabase.from(TABLE).select(select);
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    if (search) {
      q = q.ilike('title', `%${search}%`);
    }
    if (sort) {
      const desc = sort.startsWith('-');
      const col = desc ? sort.slice(1) : sort;
      q = q.order(col, { ascending: !desc });
    } else {
      q = q.order('created_at', { ascending: false });
    }
    const { data, error } = await q;
    if (error) throw error;

    // Attach blockedBy for each task
    for (const task of data || []) {
      const { data: deps } = await supabase.from(DEPS).select('blocked_by:tasks!task_dependencies_blocked_by_id_fkey(id, title, status)').eq('task_id', task.id);
      task.blocked_by = (deps || []).map(d => d.blocked_by).filter(Boolean);
    }
    return data || [];
  },

  async findById(id) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*, assignee:users!tasks_assignee_id_fkey(id, name, email, avatar), project:projects(id, name, color)')
      .eq('id', id)
      .single();
    if (error) throw error;

    // Attach comments
    const { data: comments } = await supabase
      .from(COMMENTS)
      .select('*, user:users(id, name, avatar)')
      .eq('task_id', id)
      .order('created_at');
    data.comments = comments || [];

    // Attach blockedBy
    const { data: deps } = await supabase
      .from(DEPS)
      .select('blocked_by:tasks!task_dependencies_blocked_by_id_fkey(id, title, status)')
      .eq('task_id', id);
    data.blocked_by = (deps || []).map(d => d.blocked_by).filter(Boolean);

    return data;
  },

  async findByProject(projectId) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('project_id', projectId);
    if (error) throw error;
    return data || [];
  },

  async create(doc) {
    const { blocked_by, ...rest } = doc;
    const { data, error } = await supabase.from(TABLE).insert(clean(rest)).select().single();
    if (error) throw error;
    if (blocked_by && blocked_by.length > 0) {
      const rows = blocked_by.map(bId => ({ task_id: data.id, blocked_by_id: bId }));
      await supabase.from(DEPS).insert(rows);
    }
    return data;
  },

  async update(id, updates) {
    const { blocked_by, ...rest } = updates;
    let data;
    if (Object.keys(rest).length > 0) {
      const result = await supabase.from(TABLE).update(rest).eq('id', id).select().single();
      if (result.error) throw result.error;
      data = result.data;
    }
    if (blocked_by !== undefined) {
      await supabase.from(DEPS).delete().eq('task_id', id);
      if (blocked_by.length > 0) {
        const rows = blocked_by.map(bId => ({ task_id: id, blocked_by_id: bId }));
        await supabase.from(DEPS).insert(rows);
      }
    }
    return data || await module.exports.findById(id);
  },

  async remove(id) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  },

  async addComment(taskId, comment) {
    const { data, error } = await supabase.from(COMMENTS).insert({ task_id: taskId, ...comment }).select('*, user:users(id, name, avatar)').single();
    if (error) throw error;
    return data;
  },

  async removeComment(commentId) {
    const { error } = await supabase.from(COMMENTS).delete().eq('id', commentId);
    if (error) throw error;
  },

  // For cron/reminders
  async findIncomplete({ notNull, neq } = {}) {
    let q = supabase
      .from(TABLE)
      .select('*, assignee:users!tasks_assignee_id_fkey(id, name, email), project:projects(id, name, color)')
      .neq('status', 'done');
    if (notNull) {
      for (const key of notNull) {
        q = q.not(key, 'is', null);
      }
    }
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }
};
