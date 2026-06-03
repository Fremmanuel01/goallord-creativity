// ============================================================
// db/pushSubscriptions.js - storage for Web Push subscriptions.
//
// One row per (user, browser/device endpoint). endpoint is unique;
// re-subscribing upserts so a device never duplicates.
// ============================================================
const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const TABLE = 'push_subscriptions';

module.exports = {
  // Upsert a subscription for a user. sub = { endpoint, keys:{p256dh, auth} }.
  async upsert(user, sub) {
    const row = clean({
      user_id:   user.id,
      user_type: user.type,
      endpoint:  sub.endpoint,
      p256dh:    sub.keys && sub.keys.p256dh,
      auth:      sub.keys && sub.keys.auth,
    });
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(row, { onConflict: 'endpoint' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async findByUser(userId) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId);
    if (error) throw error;
    return data || [];
  },

  async removeByEndpoint(endpoint) {
    const { error } = await supabase.from(TABLE).delete().eq('endpoint', endpoint);
    if (error) throw error;
  },
};
