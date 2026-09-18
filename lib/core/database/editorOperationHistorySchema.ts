export const EDITOR_OPERATION_HISTORY_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS editor_operation_history (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`
];
