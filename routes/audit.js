const express = require('express');
const auditDb = require('../db/auditLog');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit — admin: paginated, filterable audit trail
//   ?page=&limit=&actorId=&action=&entityType=&entityId=&search=&from=&to=
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { page, limit, actorId, action, entityType, entityId, search, from, to } = req.query;
    const result = await auditDb.find({
      filter: {
        actorId, action, entityType, entityId, search,
        from: from || undefined,
        to:   to   || undefined
      },
      page:  page  || 1,
      limit: limit || 50
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audit/actions — distinct action names for the filter dropdown
router.get('/actions', requireAuth, requireAdmin, async (req, res) => {
  try {
    res.json(await auditDb.distinctActions());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
