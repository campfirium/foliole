export const REVIEW_DAILY_COUNT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS topic_daily_count_entries (
    id TEXT PRIMARY KEY NOT NULL,
    day_key TEXT NOT NULL,
    node_id TEXT NOT NULL,
    UNIQUE(day_key, node_id)
  )`,
  `CREATE TABLE IF NOT EXISTS topic_daily_count_coverage (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    started_at TEXT NOT NULL
  )`,
  `INSERT OR IGNORE INTO topic_daily_count_coverage(id, started_at)
    VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
  `CREATE TABLE IF NOT EXISTS topic_daily_counts (
    day_key TEXT PRIMARY KEY NOT NULL,
    count INTEGER NOT NULL CHECK(count >= 0)
  )`,
  `CREATE TRIGGER IF NOT EXISTS topic_daily_count_insert
    AFTER INSERT ON topic_daily_count_entries BEGIN
      INSERT INTO topic_daily_counts(day_key, count) VALUES (NEW.day_key, 1)
      ON CONFLICT(day_key) DO UPDATE SET count = count + 1;
    END`
];
