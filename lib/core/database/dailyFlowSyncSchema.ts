import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

export const DAILY_FLOW_SYNC_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS daily_flow_sync_facts (
    id TEXT PRIMARY KEY, root_id TEXT NOT NULL, occurred_at TEXT NOT NULL, day_start TEXT NOT NULL,
    payload_json TEXT NOT NULL, day_end TEXT NOT NULL DEFAULT '', parent_id TEXT, kind TEXT NOT NULL DEFAULT ''
  )`,
  'CREATE INDEX IF NOT EXISTS daily_flow_sync_day ON daily_flow_sync_facts(day_start, occurred_at, id)',
  'CREATE INDEX IF NOT EXISTS daily_flow_sync_root ON daily_flow_sync_facts(root_id, occurred_at, id)',
  `CREATE TABLE IF NOT EXISTS daily_flow_sync_projection (
    id INTEGER PRIMARY KEY CHECK(id = 1), root_id TEXT NOT NULL, head_id TEXT NOT NULL, merged INTEGER NOT NULL DEFAULT 0
  )`
] as const;

export function migrateDailyFlowSync(db: DatabaseMigrationTarget) {
  for (const sql of DAILY_FLOW_SYNC_SCHEMA) db.exec(sql);
}

export async function migrateCompanionDailyFlowSync(db: DbPort) {
  for (const sql of DAILY_FLOW_SYNC_SCHEMA) await db.run(sql);
}
