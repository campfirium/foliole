export const SOURCE_DISPOSITION_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS source_disposition_states (
    source_kind TEXT NOT NULL,
    source_scope TEXT NOT NULL,
    original_title TEXT NOT NULL,
    disposition TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (source_kind, source_scope, original_title)
  )`
];
