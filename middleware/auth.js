const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) { req.user = null; return next(); }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    req.user = null;
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

// Check a specific permission — admins always pass, staff checked against permissions
function requirePermission(permKey) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    // Admins bypass all permission checks
    if (req.user.role === 'admin') return next();
    // Staff must have the permission enabled
    if (req.user.permissions && req.user.permissions[permKey]) return next();
    return res.status(403).json({ error: 'You do not have permission to access this resource' });
  };
}

module.exports = { requireAuth, optionalAuth, requireAdmin, requirePermission };
