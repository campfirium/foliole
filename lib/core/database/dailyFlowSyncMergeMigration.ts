import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

const columns = [
  ['daily_flow_sync_facts', 'day_end', "TEXT NOT NULL DEFAULT ''"],
  ['daily_flow_sync_facts', 'parent_id', 'TEXT'],
  ['daily_flow_sync_facts', 'kind', "TEXT NOT NULL DEFAULT ''"],
  ['daily_flow_sync_projection', 'merged', 'INTEGER NOT NULL DEFAULT 0']
] as const;

export const DAILY_FLOW_SYNC_MERGE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS daily_flow_sync_create ON daily_flow_sync_facts(kind, day_start DESC)',
  'CREATE INDEX IF NOT EXISTS daily_flow_sync_interval ON daily_flow_sync_facts(day_end, day_start)',
  'CREATE INDEX IF NOT EXISTS daily_flow_sync_parent ON daily_flow_sync_facts(root_id, parent_id)'
] as const;
const BACKFILL = `UPDATE daily_flow_sync_facts SET
  day_end=json_extract(payload_json, '$.settings.dayWindow.end'),
  parent_id=json_extract(payload_json, '$.parentId'), kind=json_extract(payload_json, '$.kind')
  WHERE day_end='' OR kind=''`;

export function migrateDailyFlowSyncMerge(db: DatabaseMigrationTarget) {
  for (const [table, column, type] of columns) {
    const existing = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!existing.some(row => row.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  db.exec(BACKFILL);
  for (const sql of DAILY_FLOW_SYNC_MERGE_INDEXES) db.exec(sql);
}

export async function migrateCompanionDailyFlowSyncMerge(db: DbPort) {
  for (const [table, column, type] of columns) {
    const existing = await db.query<{ name: string }>(`PRAGMA table_info(${table})`);
    if (!existing.some(row => row.name === column)) await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  await db.run(BACKFILL);
  for (const sql of DAILY_FLOW_SYNC_MERGE_INDEXES) await db.run(sql);
}
