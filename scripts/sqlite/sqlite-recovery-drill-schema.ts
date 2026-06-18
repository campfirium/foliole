export function createDrillSchema(sqlite: import('better-sqlite3').Database) {
  sqlite.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT REFERENCES nodes(id),
      kind TEXT NOT NULL DEFAULT 'topic',
      title TEXT NOT NULL,
      is_title_manual INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL DEFAULT '',
      reveal TEXT,
      position INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE node_order (
      node_id TEXT PRIMARY KEY REFERENCES nodes(id),
      position INTEGER NOT NULL
    );
    CREATE TABLE node_review (
      node_id TEXT PRIMARY KEY REFERENCES nodes(id),
      due TEXT NOT NULL,
      last_review_at TEXT,
      state INTEGER NOT NULL DEFAULT 0,
      stability REAL NOT NULL DEFAULT 0,
      difficulty REAL NOT NULL DEFAULT 0,
      elapsed_days INTEGER NOT NULL DEFAULT 0,
      scheduled_days INTEGER NOT NULL DEFAULT 0,
      reps INTEGER NOT NULL DEFAULT 0,
      lapses INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE review_log (
      id TEXT PRIMARY KEY,
      op_id TEXT NOT NULL UNIQUE,
      device_id TEXT NOT NULL,
      node_id TEXT NOT NULL REFERENCES nodes(id),
      grade INTEGER NOT NULL,
      scheduler_version TEXT NOT NULL,
      reviewed_at TEXT NOT NULL,
      due_before TEXT NOT NULL,
      stability_before REAL NOT NULL,
      difficulty_before REAL NOT NULL,
      due_after TEXT NOT NULL,
      stability_after REAL NOT NULL,
      difficulty_after REAL NOT NULL
    );
    CREATE TABLE workspace_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}
