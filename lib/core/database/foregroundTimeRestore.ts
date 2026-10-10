import type { DbPort } from '../sync/dbPort.js';

import { FOREGROUND_SOURCE_PREFIX, renewForegroundSources } from './foregroundTimeSource.js';
import { computeSyncContentHash } from './syncState.js';
import { NEXT_SYNC_STATE_SEQ_SQL } from './syncStateSequenceSchemaStatements.js';

type TimeRow = { id: string; source_id: string; day_key: string; duration_ms: number };
export interface ForegroundTimePreservation {
  rows: TimeRow[];
  sourceKeys: string[];
  startedAt: string | null;
}

export async function readForegroundTimePreservation(db: DbPort): Promise<ForegroundTimePreservation> {
  const tables = new Set((await db.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table'"
  )).map((row) => row.name));
  const rows = tables.has('foreground_daily_time')
    ? await db.query<TimeRow>('SELECT id, source_id, day_key, duration_ms FROM foreground_daily_time') : [];
  const sourceKeys = tables.has('workspace_meta') ? (await db.query<{ key: string }>(
    'SELECT key FROM workspace_meta WHERE key GLOB ?', [FOREGROUND_SOURCE_PREFIX + '*']
  )).map((row) => row.key) : [];
  const [coverage] = tables.has('foreground_time_coverage')
    ? await db.query<{ started_at: string }>('SELECT started_at FROM foreground_time_coverage WHERE id = 1') : [];
  return { rows, sourceKeys, startedAt: coverage?.started_at ?? null };
}

export async function isolateForegroundTimeForRestore(db: DbPort) {
  const preserved = await readForegroundTimePreservation(db);
  if (preserved.rows.length > 0) await db.run('DELETE FROM foreground_daily_time');
  return preserved;
}

export async function mergeRestoredForegroundTime(db: DbPort, preserved: ForegroundTimePreservation, hostName: string) {
  await db.transaction(async (tx) => {
    for (const row of preserved.rows) {
      await tx.run(`INSERT INTO foreground_daily_time(id, source_id, day_key, duration_ms) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET duration_ms = MAX(foreground_daily_time.duration_ms, excluded.duration_ms)`,
      [row.id, row.source_id, row.day_key, row.duration_ms]);
    }
    if (preserved.startedAt !== null) {
      await tx.run('UPDATE foreground_time_coverage SET started_at = MIN(started_at, ?) WHERE id = 1', [preserved.startedAt]);
    }
    for (const key of preserved.sourceKeys) {
      await tx.run(`INSERT INTO workspace_meta(key, value, updated_at) VALUES (?, '', ?)
        ON CONFLICT(key) DO NOTHING`, [key, new Date().toISOString()]);
    }
    await renewForegroundSources(tx);
    await publishForegroundTimeAfterRestore(tx, hostName);
  });
}

async function publishForegroundTimeAfterRestore(db: DbPort, hostName: string) {
  const [present] = await db.query('SELECT 1 AS present FROM sqlite_master WHERE name = ?', ['foreground_daily_time']);
  if (!present) return;
  const rows = await db.query<TimeRow>('SELECT id, source_id, day_key, duration_ms FROM foreground_daily_time');
  for (const row of rows) {
    const contentHash = computeSyncContentHash('foreground_daily_time', {
      source_id: row.source_id, day_key: row.day_key, duration_ms: row.duration_ms
    });
    await db.run(`INSERT INTO sync_object_state(object_type, object_id, state_seq, content_hash,
      last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
      VALUES ('foreground_daily_time', ?, ${NEXT_SYNC_STATE_SEQ_SQL}, ?, ?, ?, NULL, 1)
      ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
      content_hash = excluded.content_hash, last_modified_by_host_name = excluded.last_modified_by_host_name,
      updated_at = excluded.updated_at, deleted_at = NULL, sync_dirty = 1`,
    [row.id, contentHash, hostName, new Date().toISOString()]);
  }
}
