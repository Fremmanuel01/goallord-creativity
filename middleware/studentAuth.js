const jwt = require('jsonwebtoken');
const { extractToken } = require('../lib/authCookie');

const JWT_VERIFY_OPTS = { algorithms: ['HS256'] };

function requireStudent(req, res, next) {
  const token = extractToken(req, 'gl_student_token');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, JWT_VERIFY_OPTS);
    if (decoded.role !== 'student') return res.status(403).json({ error: 'Student access only' });
    req.student = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Alias used by academy routes - sets req.user instead of req.student
function requireStudentAuth(req, res, next) {
  const token = extractToken(req, 'gl_student_token');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, JWT_VERIFY_OPTS);
    if (decoded.role !== 'student') return res.status(403).json({ error: 'Student access only' });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireStudent, requireStudentAuth };
