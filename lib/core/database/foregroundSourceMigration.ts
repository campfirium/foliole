import { z } from 'zod';

import type { DbPort } from '../sync/dbPort.js';
import { foregroundSourceSchema } from '../sync/foregroundSource.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { computeSyncContentHash } from './syncState.js';
import { NEXT_SYNC_STATE_SEQ_SQL } from './syncStateSequenceSchemaStatements.js';

const sourcesSql = `SELECT json_object('source_id', source_id, 'days', json_group_object(day_key, duration_ms)) AS payload_json
  FROM (SELECT source_id, day_key, duration_ms FROM foreground_daily_time ORDER BY source_id, day_key) GROUP BY source_id`;
const publishSql = `INSERT INTO sync_object_state(object_type, object_id, state_seq, content_hash,
  last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
  VALUES ('foreground_source', ?, ${NEXT_SYNC_STATE_SEQ_SQL}, ?, '', ?, NULL, 1)
  ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
  content_hash = excluded.content_hash, updated_at = excluded.updated_at, deleted_at = NULL, sync_dirty = 1`;
const retireSql = "DELETE FROM sync_object_state WHERE object_type = 'foreground_daily_time'";
const triggerSql = ['insert', 'update', 'delete'].map(action =>
  `DROP TRIGGER IF EXISTS trg_sync_identity_foreground_daily_time_${action}`);

export function retireForegroundIdentityTriggers(sqlite: DatabaseMigrationTarget) {
  for (const sql of triggerSql) sqlite.exec(sql);
}
export async function retireCompanionForegroundIdentityTriggers(db: DbPort) {
  for (const sql of triggerSql) await db.run(sql);
}
function parameters(row: unknown) {
  const { payload_json: json } = z.object({ payload_json: z.string() }).parse(row);
  const payload = foregroundSourceSchema.parse(JSON.parse(json));
  return [payload.source_id, computeSyncContentHash('foreground_source', payload), new Date().toISOString()];
}
export function migrateForegroundSources(sqlite: DatabaseMigrationTarget) {
  for (const sql of triggerSql) sqlite.exec(sql);
  for (const row of sqlite.prepare(sourcesSql).all()) sqlite.prepare(publishSql).run(...parameters(row));
  sqlite.exec(retireSql);
}
export async function migrateCompanionForegroundSources(db: DbPort) {
  for (const sql of triggerSql) await db.run(sql);
  for (const row of await db.query(sourcesSql)) await db.run(publishSql, parameters(row));
  await db.run(retireSql);
}
