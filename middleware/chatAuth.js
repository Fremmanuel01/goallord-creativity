// ============================================================
// middleware/chatAuth.js - unified auth for the in-app chat.
//
// Accepts a student, lecturer, or admin/staff JWT and normalises
// it to req.chatUser = { type: 'student'|'lecturer'|'admin', id, name }.
// ============================================================
const jwt = require('jsonwebtoken');
const { extractAnyToken } = require('../lib/authCookie');

const JWT_VERIFY_OPTS = { algorithms: ['HS256'] };

function normalize(decoded) {
  const role = decoded.role;
  let type;
  if (role === 'student') type = 'student';
  else if (role === 'lecturer') type = 'lecturer';
  else if (role === 'admin' || role === 'staff') type = 'admin';
  else return null;
  return {
    type,
    id: decoded.id,
    name: decoded.name || decoded.fullName || decoded.email || 'User',
    role
  };
}

function requireChatUser(req, res, next) {
  const token = extractAnyToken(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, JWT_VERIFY_OPTS);
    const user = normalize(decoded);
    if (!user) return res.status(403).json({ error: 'Chat not available for this account type' });
    req.chatUser = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Verify a token string (for socket handshakes); returns chatUser or null.
function verifyChatToken(token) {
  try {
    return normalize(jwt.verify(token, process.env.JWT_SECRET, JWT_VERIFY_OPTS));
  } catch {
    return null;
  }
}

module.exports = { requireChatUser, verifyChatToken };
