import { CYCLE_ENTRY_INDEX, CYCLE_ENTRY_SCHEMA } from '../flow/cycleFlowTypes.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

export const DAILY_FLOW_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS daily_flow_state (
    id INTEGER PRIMARY KEY CHECK(id = 1), day_key TEXT NOT NULL, revision INTEGER NOT NULL,
    settings_key TEXT NOT NULL, mode TEXT NOT NULL, session_json TEXT NOT NULL,
    invalidated INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS daily_flow_entries (
    node_id TEXT PRIMARY KEY, initial_position INTEGER NOT NULL,
    queue_position INTEGER, soon_position INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS daily_flow_operations (
    op_id TEXT PRIMARY KEY, input_hash TEXT NOT NULL, revision INTEGER NOT NULL, card_json TEXT
  )`,
  ...['nodes', 'node_review', 'node_reading'].flatMap(table => ['INSERT', 'UPDATE', 'DELETE'].map(event =>
    `CREATE TRIGGER IF NOT EXISTS daily_flow_${table}_${event.toLowerCase()} AFTER ${event} ON ${table}
      BEGIN UPDATE daily_flow_state SET invalidated = 1 WHERE id = 1; END`))
] as const;

export const DAILY_FLOW_CURRENT_SCHEMA = [DAILY_FLOW_SCHEMA[0], CYCLE_ENTRY_SCHEMA.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS '),
  DAILY_FLOW_SCHEMA[2].replace('card_json TEXT', 'card_json TEXT, source_session_json TEXT'), CYCLE_ENTRY_INDEX.replace('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS '), ...DAILY_FLOW_SCHEMA.slice(3)];

export function migrateDailyFlow(sqlite: DatabaseMigrationTarget) {
  for (const statement of DAILY_FLOW_SCHEMA) sqlite.exec(statement);
}

export async function migrateCompanionDailyFlow(db: DbPort) {
  for (const statement of DAILY_FLOW_SCHEMA) await db.run(statement);
}
