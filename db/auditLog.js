const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'audit_log';

module.exports = {
  async create(doc) {
    const { data, error } = await supabase.from(TABLE).insert(clean(doc)).select().single();
    if (error) throw error;
    return data;
  },

  // Paginated, filtered list (newest first).
  // filter: { actorId, action, entityType, entityId, search, from, to }
  async find({ filter = {}, page = 1, limit = 50 } = {}) {
    let q = supabase.from(TABLE).select('*', { count: 'exact' });

    if (filter.actorId)    q = q.eq('actor_id', filter.actorId);
    if (filter.action)     q = q.eq('action', filter.action);
    if (filter.entityType) q = q.eq('entity_type', filter.entityType);
    if (filter.entityId)   q = q.eq('entity_id', filter.entityId);
    if (filter.from)       q = q.gte('created_at', filter.from);
    if (filter.to)         q = q.lte('created_at', filter.to);
    if (filter.search) {
      const s = filter.search.replace(/[%,]/g, '');
      q = q.or(`summary.ilike.%${s}%,actor_name.ilike.%${s}%,actor_email.ilike.%${s}%,path.ilike.%${s}%`);
    }

    const p    = Math.max(1, Number(page) || 1);
    const lim  = Math.min(200, Math.max(1, Number(limit) || 50));
    const start = (p - 1) * lim;

    q = q.order('created_at', { ascending: false }).range(start, start + lim - 1);

    const { data, error, count } = await q;
    if (error) throw error;
    return { data: data || [], total: count || 0, page: p, limit: lim };
  },

  // Distinct action names — powers the viewer's filter dropdown.
  async distinctActions() {
    const { data, error } = await supabase.from(TABLE).select('action').limit(1000);
    if (error) throw error;
    return [...new Set((data || []).map(r => r.action))].sort();
  }
};
