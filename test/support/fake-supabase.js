// ============================================================
// test/support/fake-supabase.js
//
// A small in-memory stand-in for the @supabase/supabase-js client,
// supporting only the query shapes used by the chat code:
//   .from(t).select(cols, {count,head}).eq/neq/gt/lt/in/order/limit
//   .single()  .insert()  .update()  .upsert(obj,{onConflict,ignoreDuplicates})
// plus PostgREST-style embeds: 'batch:batches(...)', 'lecturer:lecturers(...)'.
//
// createFakeSupabase(seed) → a client backed by `seed` tables (cloned).
// Deterministic: ids and timestamps come from a monotonic counter, so
// there is no reliance on Date.now()/random.
// ============================================================

const BASE_TS = 1700000000000; // fixed epoch for deterministic created_at

function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

function parseEmbeds(sel) {
  if (!sel || typeof sel !== 'string') return [];
  const embeds = [];
  const re = /(\w+):(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(sel))) embeds.push({ alias: m[1], table: m[2] });
  return embeds;
}

function createFakeSupabase(seed) {
  const store = {};
  for (const [t, rows] of Object.entries(seed || {})) store[t] = clone(rows) || [];
  let seq = 0;
  const nextId = (t) => `${t}_${++seq}`;
  const nextTs = () => new Date(BASE_TS + (++seq) * 1000).toISOString();

  function table(name) { return (store[name] = store[name] || []); }

  function applyEmbeds(rows, sel) {
    const embeds = parseEmbeds(sel);
    if (!embeds.length) return rows;
    return rows.map((row) => {
      const out = clone(row);
      for (const e of embeds) {
        const fk = e.alias + '_id';
        const target = table(e.table).find((x) => x.id === row[fk]);
        out[e.alias] = target ? clone(target) : null;
      }
      return out;
    });
  }

  class Query {
    constructor(name) {
      this.name = name;
      this.filters = [];
      this.op = 'select';
      this.cols = '*';
      this.opts = {};
      this.payload = null;
      this.upsertOpts = null;
      this._order = null;
      this._limit = null;
      this._single = false;
    }
    select(cols, opts) { this.cols = cols || '*'; if (opts) this.opts = opts; if (this.op !== 'insert' && this.op !== 'update' && this.op !== 'upsert') this.op = 'select'; this._wantsSelect = true; return this; }
    insert(payload) { this.op = 'insert'; this.payload = payload; return this; }
    update(payload) { this.op = 'update'; this.payload = payload; return this; }
    upsert(payload, opts) { this.op = 'upsert'; this.payload = payload; this.upsertOpts = opts || {}; return this; }
    eq(col, val) { this.filters.push(['eq', col, val]); return this; }
    neq(col, val) { this.filters.push(['neq', col, val]); return this; }
    gt(col, val) { this.filters.push(['gt', col, val]); return this; }
    lt(col, val) { this.filters.push(['lt', col, val]); return this; }
    in(col, vals) { this.filters.push(['in', col, vals]); return this; }
    order(col, o) { this._order = { col, ascending: !o || o.ascending !== false }; return this; }
    limit(n) { this._limit = n; return this; }
    single() { this._single = true; return this._run(); }

    _match(row) {
      return this.filters.every(([kind, col, val]) => {
        if (kind === 'eq') return row[col] === val;
        if (kind === 'neq') return row[col] !== val;
        if (kind === 'gt') return row[col] > val;
        if (kind === 'lt') return row[col] < val;
        if (kind === 'in') return Array.isArray(val) && val.includes(row[col]);
        return true;
      });
    }

    _run() {
      try {
        if (this.op === 'insert') return Promise.resolve(this._insert());
        if (this.op === 'update') return Promise.resolve(this._update());
        if (this.op === 'upsert') return Promise.resolve(this._upsert());
        return Promise.resolve(this._select());
      } catch (e) {
        return Promise.resolve({ data: null, error: { message: e.message } });
      }
    }

    _selectRows() {
      let rows = table(this.name).filter((r) => this._match(r));
      if (this._order) {
        const { col, ascending } = this._order;
        rows = rows.slice().sort((a, b) => {
          if (a[col] === b[col]) return 0;
          return (a[col] > b[col] ? 1 : -1) * (ascending ? 1 : -1);
        });
      }
      if (this._limit != null) rows = rows.slice(0, this._limit);
      return rows;
    }

    _select() {
      let rows = this._selectRows();
      if (this.opts && this.opts.head && this.opts.count) {
        return { data: null, error: null, count: rows.length };
      }
      rows = applyEmbeds(rows, this.cols).map(clone);
      if (this._single) {
        if (rows.length === 0) return { data: null, error: { message: 'No rows found' } };
        return { data: rows[0], error: null };
      }
      return { data: rows, error: null };
    }

    _insert() {
      const arr = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted = arr.map((doc) => {
        const row = clone(doc);
        if (row.id == null) row.id = nextId(this.name);
        if (row.created_at == null) row.created_at = nextTs();
        table(this.name).push(row);
        return clone(row);
      });
      if (!this._wantsSelect) return { data: null, error: null };
      if (this._single) return { data: inserted[0], error: null };
      return { data: inserted, error: null };
    }

    _update() {
      const rows = table(this.name).filter((r) => this._match(r));
      rows.forEach((r) => Object.assign(r, this.payload));
      if (!this._wantsSelect) return { data: null, error: null };
      const out = applyEmbeds(rows, this.cols).map(clone);
      if (this._single) {
        if (out.length === 0) return { data: null, error: { message: 'No rows found' } };
        return { data: out[0], error: null };
      }
      return { data: out, error: null };
    }

    _upsert() {
      const arr = Array.isArray(this.payload) ? this.payload : [this.payload];
      const onConflict = (this.upsertOpts.onConflict || '').split(',').map((s) => s.trim()).filter(Boolean);
      const ignoreDuplicates = !!this.upsertOpts.ignoreDuplicates;
      arr.forEach((doc) => {
        let existing = null;
        if (onConflict.length) {
          existing = table(this.name).find((r) => onConflict.every((k) => r[k] === doc[k]));
        }
        if (existing) {
          if (!ignoreDuplicates) Object.assign(existing, doc);
        } else {
          const row = clone(doc);
          if (row.id == null && this.name !== 'chat_participants') row.id = nextId(this.name);
          if (row.created_at == null) row.created_at = nextTs();
          table(this.name).push(row);
        }
      });
      return { data: null, error: null };
    }

    then(onF, onR) { return this._run().then(onF, onR); }
  }

  return {
    _store: store,
    from(name) { return new Query(name); }
  };
}

module.exports = { createFakeSupabase };
