-- Cubicle leaderboard schema (D1 / SQLite)
CREATE TABLE IF NOT EXISTS scores (
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
  PRIMARY KEY (uuid, mode)
);
CREATE INDEX IF NOT EXISTS idx_scores_mode_score ON scores(mode, score DESC);

CREATE TABLE IF NOT EXISTS submissions_log (
  uuid TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sublog_uuid_at ON submissions_log(uuid, at);
