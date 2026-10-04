export const FOREGROUND_TIME_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS foreground_daily_time (
    id TEXT PRIMARY KEY NOT NULL,
    source_id TEXT NOT NULL,
    day_key TEXT NOT NULL,
    duration_ms INTEGER NOT NULL CHECK(duration_ms >= 0),
    UNIQUE(source_id, day_key)
  )`,
  `CREATE INDEX IF NOT EXISTS foreground_daily_time_day ON foreground_daily_time(day_key)`,
  `CREATE TABLE IF NOT EXISTS foreground_time_coverage (
    id INTEGER PRIMARY KEY CHECK(id = 1), started_at TEXT NOT NULL
  )`,
  `INSERT OR IGNORE INTO foreground_time_coverage(id, started_at)
    VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
] as const;
