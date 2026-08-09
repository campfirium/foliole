export const ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS companion_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`
];
