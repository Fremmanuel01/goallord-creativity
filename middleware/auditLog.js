// ============================================================
// middleware/auditLog.js - admin/staff action audit trail
//
// Mounted on the /api surface. For every state-changing request
// (POST/PUT/PATCH/DELETE) made by a dashboard account, it records
// one append-only audit_log row once the response finishes. The
// finish hook runs after the route handler, so req.user (set by
// requireAuth inside the route) is available.
//
// recordAudit() is exported for events that don't flow through the
// mutation path (e.g. login, which has no token yet).
// ============================================================
const auditDb = require('../db/auditLog');

const VERB = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };

// Request-body keys that must never be stored in the log.
const SECRET_KEYS = new Set([
  'password', 'newpassword', 'currentpassword', 'confirmpassword',
  'totpcode', 'code', 'secret', 'token', 'reset_token'
]);

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (SECRET_KEYS.has(k.toLowerCase())) { out[k] = '[redacted]'; continue; }
    if (typeof v === 'string' && v.length > 300) { out[k] = v.slice(0, 300) + '…'; continue; }
    out[k] = v;
  }
  return out;
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || '';
}

// Entity type + id from a stable /api/<type>/<id>/… URL.
function deriveEntity(req) {
  const pathOnly = (req.originalUrl || '').split('?')[0];
  const parts = pathOnly.split('/').filter(Boolean);          // ['api','students','<id>',…]
  const idx = parts[0] === 'api' ? 1 : 0;
  const entityType = parts[idx] || '';
  const after = parts.slice(idx + 1);
  const entityId = after.find(s => /^[0-9a-f]{8}-[0-9a-f-]+$/i.test(s) || /^\d+$/.test(s)) || null;
  return { entityType, entityId };
}

// Fire-and-forget recorder; never throws into the request path.
async function recordAudit(fields) {
  try {
    await auditDb.create(fields);
  } catch (e) {
    console.error('[audit] record failed:', e.message);
  }
}

function auditLogger(req, res, next) {
  const method = req.method;
  if (!VERB[method]) return next();                  // only state-changing requests
  const bodySnapshot = sanitizeBody(req.body);       // capture before handlers mutate req.body

  res.on('finish', () => {
    try {
      const actor = req.user;                        // populated by requireAuth during the handler
      // Keep this an *admin* audit log: only dashboard accounts.
      if (!actor || !['admin', 'staff'].includes(actor.role)) return;

      const { entityType, entityId } = deriveEntity(req);
      const verb = VERB[method];
      const ok = res.statusCode < 400;
      const who = actor.name || actor.email || 'User';
      const summary = `${who} ${ok ? '' : 'failed to '}${verb}d ${entityType}${entityId ? ' ' + entityId : ''}`
        .replace(/\s+/g, ' ').trim();

      recordAudit({
        actor_id: actor.id || null,
        actor_name: actor.name || '',
        actor_email: actor.email || '',
        actor_role: actor.role || '',
        action: `${entityType || 'api'}.${verb}`,
        entity_type: entityType || '',
        entity_id: entityId ? String(entityId) : null,
        summary,
        method,
        path: (req.originalUrl || '').split('?')[0],
        status: res.statusCode,
        ip: clientIp(req),
        metadata: { body: bodySnapshot }
      });
    } catch (e) { /* never break the response */ }
  });

  next();
}

module.exports = { auditLogger, recordAudit, sanitizeBody, clientIp };
