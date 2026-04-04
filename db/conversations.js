const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'conversations';
const MESSAGES = 'conversation_messages';

module.exports = {
  async findBySessionId(sessionId) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('session_id', sessionId).limit(1).maybeSingle();
    if (error) throw error;
    if (data) {
      const { data: msgs } = await supabase.from(MESSAGES).select('*').eq('conversation_id', data.id).order('timestamp');
      data.messages = msgs || [];
    }
    return data;
  },

  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (error) throw error;
    const { data: msgs } = await supabase.from(MESSAGES).select('*').eq('conversation_id', id).order('timestamp');
    data.messages = msgs || [];
    return data;
  },

  async find({ filter = {}, sort, page, limit } = {}) {
    let q = supabase.from(TABLE).select('*', { count: 'exact' });
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    if (sort) {
      const desc = sort.startsWith('-');
      const col = desc ? sort.slice(1) : sort;
      q = q.order(col, { ascending: !desc });
    } else {
      q = q.order('updated_at', { ascending: false });
    }
    if (page && limit) {
      const from = (Number(page) - 1) * Number(limit);
      const to = from + Number(limit) - 1;
      q = q.range(from, to);
    }
    const { data, error, count } = await q;
    if (error) throw error;

    // Attach messages for each conversation
    for (const convo of data || []) {
      const { data: msgs } = await supabase.from(MESSAGES).select('*').eq('conversation_id', convo.id).order('timestamp');
      convo.messages = msgs || [];
    }
    return { data: data || [], count };
  },

  async create(doc) {
    const { messages, ...rest } = doc;
    const { data, error } = await supabase.from(TABLE).insert(clean(rest)).select().single();
    if (error) throw error;
    if (messages && messages.length > 0) {
      const rows = messages.map(m => ({ conversation_id: data.id, ...m }));
      await supabase.from(MESSAGES).insert(rows);
    }
    data.messages = messages || [];
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase.from(TABLE).update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async addMessage(conversationId, message) {
    const { data, error } = await supabase.from(MESSAGES).insert({ conversation_id: conversationId, ...message }).select().single();
    if (error) throw error;
    return data;
  },

  async incrementUnread(conversationId) {
    // Use raw SQL via rpc or fetch+update
    const convo = await module.exports.findById(conversationId);
    await supabase.from(TABLE).update({ unread_by_agent: (convo.unread_by_agent || 0) + 1 }).eq('id', conversationId);
  },

  async getLastAgentMessage(conversationId) {
    const { data, error } = await supabase
      .from(MESSAGES)
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('role', 'agent')
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
};
