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

module.exports = { requireLecturer, requireLecturerOnly };
