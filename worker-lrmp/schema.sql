-- LRMP sync schema (D1 / SQLite).
-- One row per slot. There is currently exactly one slot ('default') because this is a
-- single-household, deliberately unauthenticated app — not a multi-tenant service.
CREATE TABLE IF NOT EXISTS state (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,          -- JSON: { plan, freezer, favourites }
  updated_at INTEGER NOT NULL  -- ms epoch, set by the Worker on every write
);
