// Strip undefined values from an object so PostgreSQL uses column defaults
function clean(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// For bulk inserts
function cleanBulk(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return docs;
  return docs.map(clean);
}

// Convert snake_case keys to camelCase, and add _id alias for id
function toCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// JSONB fields that should NOT have their internal keys transformed
// These store user-defined data with their own key structure
const JSONB_FIELDS = new Set([
  'data', 'permissions', 'reactions', 'affiliateCta', 'affiliate_cta',
  'tuition', 'schedule', 'stats', 'tracks', 'instructors', 'faqs',
  'features', 'options', 'subtopics', 'resources', 'tags', 'classDays',
  'class_days'
]);

// Known Supabase relation objects that SHOULD be transformed
const RELATION_FIELDS = new Set([
  'assignee', 'project', 'batch', 'student', 'lecturer', 'user',
  'product', 'blocked_by', 'blockedBy', 'taken_by_lecturer',
  'takenByLecturer', 'members', 'project_members', 'projectMembers'
]);

function camelKeys(obj, depth = 0) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(item => camelKeys(item, depth));
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;

  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const camelKey = toCamel(key);

    if (JSONB_FIELDS.has(key) || JSONB_FIELDS.has(camelKey)) {
      // Pass through JSONB data as-is — don't transform internal keys
      result[camelKey] = val;
    } else if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      // Transform nested relation objects (assignee, project, etc.)
      result[camelKey] = camelKeys(val, depth + 1);
    } else if (Array.isArray(val)) {
      // Arrays: transform items if they look like DB rows (have 'id' key)
      result[camelKey] = val.map(item => {
        if (item !== null && typeof item === 'object' && !(item instanceof Date) && item.id) {
          return camelKeys(item, depth + 1);
        }
        return item;
      });
    } else {
      result[camelKey] = val;
    }

    // Add _id alias only for UUID-style id fields (not numeric ids in JSONB)
    if (key === 'id' && typeof val === 'string' && val.includes('-')) {
      result._id = val;
    }
  }
  return result;
}

module.exports = { clean, cleanBulk, camelKeys };
