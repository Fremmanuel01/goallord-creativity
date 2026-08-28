const jwt = require('jsonwebtoken');
const { extractAnyToken } = require('../lib/authCookie');

const JWT_VERIFY_OPTS = { algorithms: ['HS256'] };

function requireLecturer(req, res, next) {
  // Lecturer routes also admit admins, so accept any auth cookie / Bearer.
  const token = extractAnyToken(req);
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, JWT_VERIFY_OPTS);
    if (decoded.role !== 'lecturer' && decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireLecturerOnly(req, res, next) {
  const token = extractAnyToken(req);
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, JWT_VERIFY_OPTS);
    if (decoded.role !== 'lecturer') {
      return res.status(403).json({ error: 'Lecturer access only' });
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Resource scoping helpers ─────────────────────────────────
// requireLecturer proves the caller IS a lecturer/admin; these prove the
// lecturer may touch a SPECIFIC resource. Admins are always unrestricted.

// Batch ids a non-admin lecturer may manage (via lecturer_batches).
// Returns null for admins = unrestricted.
async function lecturerBatchIds(user) {
  if (!user || user.role === 'admin') return null;
  const supabase = require('../lib/supabase');
  const { data } = await supabase.from('lecturer_batches').select('batch_id').eq('lecturer_id', user.id);
  return (data || []).map(r => r.batch_id);
}

// May this user manage resources belonging to the given batch?
async function canManageBatch(user, batchId) {
  const ids = await lecturerBatchIds(user);
  return ids === null || (batchId != null && ids.includes(batchId));
}

// Docs owned via lecturer_id (materials, assignments): admins pass,
// lecturers only their own — mirrors the list-endpoint filtering.
function ownsDoc(user, doc) {
  return !!user && (user.role === 'admin' || (!!doc && doc.lecturer_id === user.id));
}

module.exports = { requireLecturer, requireLecturerOnly, lecturerBatchIds, canManageBatch, ownsDoc };
