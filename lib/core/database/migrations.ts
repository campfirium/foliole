export interface DatabaseMigrationTarget {
  exec(sql: string): void;
  pragma(command: string, options?: { simple?: boolean }): unknown;
  transaction<T>(fn: () => T): () => T;
}

export interface DatabaseConnectionLike<TSqlite extends DatabaseMigrationTarget = DatabaseMigrationTarget> {
  sqlite: TSqlite;
}

export const DATABASE_SCHEMA_VERSION = 8;

const CREATE_TABLE_STATEMENTS_V1 = [
  `CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES nodes(id),
    title TEXT NOT NULL,
    is_title_manual INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL DEFAULT '',
    reveal TEXT,
    anchor_link TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS node_review (
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
  )`,
  `CREATE TABLE IF NOT EXISTS review_log (
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
  )`,
  `CREATE TABLE IF NOT EXISTS node_order (
    node_id TEXT PRIMARY KEY REFERENCES nodes(id),
    position INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    hash TEXT NOT NULL UNIQUE,
    original_name TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`
];

const CREATE_TABLE_STATEMENTS_V2 = [
  `CREATE TABLE IF NOT EXISTS workspace_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS node_view_state (
    node_id TEXT PRIMARY KEY,
    scroll_top INTEGER NOT NULL DEFAULT 0,
    selection_from INTEGER,
    selection_to INTEGER,
    updated_at TEXT NOT NULL
  )`
];

const CREATE_TABLE_STATEMENTS_V3 = [
  'ALTER TABLE nodes ADD COLUMN priority INTEGER',
  'ALTER TABLE nodes ADD COLUMN desired_retention REAL'
];

const CREATE_TABLE_STATEMENTS_V4 = [
  `CREATE TABLE IF NOT EXISTS node_reading (
    node_id TEXT PRIMARY KEY REFERENCES nodes(id),
    interval_duration_ms INTEGER NOT NULL DEFAULT 0,
    interval_growth_factor REAL NOT NULL DEFAULT 1,
    last_handled_at TEXT NOT NULL,
    next_at TEXT NOT NULL,
    priority REAL NOT NULL DEFAULT 0,
    reading_position INTEGER NOT NULL DEFAULT 0,
    repetition_count INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'active'
  )`
];

const CREATE_TABLE_STATEMENTS_V5 = [
  `CREATE TABLE IF NOT EXISTS import_sources (
    source_fingerprint TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_locator TEXT NOT NULL,
    first_imported_at TEXT NOT NULL,
    last_imported_at TEXT NOT NULL,
    last_content_fingerprint TEXT NOT NULL,
    latest_node_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS import_runs (
    id TEXT PRIMARY KEY,
    source_fingerprint TEXT NOT NULL,
    provider TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_locator TEXT NOT NULL,
    content_fingerprint TEXT NOT NULL,
    duplicate_semantic TEXT NOT NULL,
    result_status TEXT NOT NULL,
    node_id TEXT,
    imported_at TEXT NOT NULL,
    degraded_reason TEXT,
    failure_reason TEXT
  )`
];

const CREATE_TABLE_STATEMENTS_V6 = [
  `CREATE TABLE IF NOT EXISTS keep_import_items (
    rule_id TEXT NOT NULL,
    source_path TEXT NOT NULL,
    source_mtime_ms INTEGER NOT NULL,
    source_size_bytes INTEGER NOT NULL,
    last_node_id TEXT,
    last_status TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    last_imported_at TEXT,
    PRIMARY KEY (rule_id, source_path)
  )`
];

const CREATE_TABLE_STATEMENTS_V7 = [
  'ALTER TABLE keep_import_items ADD COLUMN highlight_source_mtime_ms INTEGER',
  'ALTER TABLE keep_import_items ADD COLUMN highlight_source_size_bytes INTEGER'
];

const CREATE_TABLE_STATEMENTS_V8 = ['ALTER TABLE nodes ADD COLUMN hide_title_heading INTEGER NOT NULL DEFAULT 0'];

function readUserVersion(sqlite: DatabaseMigrationTarget): number {
  const value = sqlite.pragma('user_version', { simple: true });
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function setUserVersion(sqlite: DatabaseMigrationTarget, version: number) {
  sqlite.pragma(`user_version = ${version}`);
}

export function runDatabaseMigrations(sqlite: DatabaseMigrationTarget) {
  const applyInTransaction = sqlite.transaction(() => {
    const currentVersion = readUserVersion(sqlite);
    if (currentVersion < 1) {
      for (const statement of CREATE_TABLE_STATEMENTS_V1) {
        sqlite.exec(statement);
      }
      setUserVersion(sqlite, 1);
    }
    if (currentVersion < 2) {
      for (const statement of CREATE_TABLE_STATEMENTS_V2) {
        sqlite.exec(statement);
      }
      setUserVersion(sqlite, 2);
    }
    if (currentVersion < 3) {
      for (const statement of CREATE_TABLE_STATEMENTS_V3) {
        sqlite.exec(statement);
      }
      setUserVersion(sqlite, 3);
    }
    if (currentVersion < 4) {
      for (const statement of CREATE_TABLE_STATEMENTS_V4) {
        sqlite.exec(statement);
      }
      setUserVersion(sqlite, 4);
    }
    if (currentVersion < 5) {
      for (const statement of CREATE_TABLE_STATEMENTS_V5) {
        sqlite.exec(statement);
      }
      setUserVersion(sqlite, 5);
    }
    if (currentVersion < 6) {
      for (const statement of CREATE_TABLE_STATEMENTS_V6) {
        sqlite.exec(statement);
      }
      setUserVersion(sqlite, 6);
    }
    if (currentVersion < 7) {
      for (const statement of CREATE_TABLE_STATEMENTS_V7) {
        sqlite.exec(statement);
      }
      setUserVersion(sqlite, 7);
    }
    if (currentVersion < 8) {
      for (const statement of CREATE_TABLE_STATEMENTS_V8) {
        sqlite.exec(statement);
      }
      setUserVersion(sqlite, 8);
    }
    if (currentVersion > DATABASE_SCHEMA_VERSION) {
      throw new Error(`database schema version ${currentVersion} is newer than supported`);
    }
  });

  applyInTransaction();
}

export function initializeDatabaseConnection<T extends DatabaseConnectionLike>(connection: T): T {
  runDatabaseMigrations(connection.sqlite);
  return connection;
}
