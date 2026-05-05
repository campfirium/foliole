import type { SqliteDatabase } from './connection.js';
import { openDatabaseConnection } from './connection.js';

const DATABASE_SCHEMA_VERSION = 2;

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

function readUserVersion(sqlite: SqliteDatabase): number {
  const value = sqlite.pragma('user_version', { simple: true });
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function setUserVersion(sqlite: SqliteDatabase, version: number) {
  sqlite.pragma(`user_version = ${version}`);
}

export function runDatabaseMigrations(sqlite: SqliteDatabase) {
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
    if (currentVersion > DATABASE_SCHEMA_VERSION) {
      throw new Error(`database schema version ${currentVersion} is newer than supported`);
    }
  });
  applyInTransaction();
}

export function initializeDatabase() {
  const connection = openDatabaseConnection();
  runDatabaseMigrations(connection.sqlite);
  return connection;
}
