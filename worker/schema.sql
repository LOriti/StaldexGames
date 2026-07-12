CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL,
  mode TEXT NOT NULL,
  name TEXT NOT NULL,
  grade TEXT NOT NULL,
  score INTEGER NOT NULL,
  tasks INTEGER DEFAULT 0,
  quota INTEGER DEFAULT 0,
  days_won INTEGER DEFAULT 0,
  perfect_days INTEGER DEFAULT 0,
  flagged INTEGER DEFAULT 0,
  flags TEXT DEFAULT '[]',
  breakdown TEXT DEFAULT '[]',
  submitted_at INTEGER,
  kitchen INTEGER DEFAULT 0,
  shareholder INTEGER DEFAULT 0,
  calendar INTEGER DEFAULT 0,
  socio INTEGER DEFAULT 0,
  sphincter INTEGER DEFAULT 0,
  watercooler INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_runs_mode_score ON runs(mode, score DESC);
CREATE INDEX IF NOT EXISTS idx_runs_uuid_mode ON runs(uuid, mode);

CREATE TABLE IF NOT EXISTS submissions_log (
  uuid TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sublog_uuid_at ON submissions_log(uuid, at);
