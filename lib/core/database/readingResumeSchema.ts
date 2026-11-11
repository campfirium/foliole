export const READING_RESUME_SCHEMA = `CREATE TABLE IF NOT EXISTS node_reading_resume (
  node_id TEXT PRIMARY KEY NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL
)`;
