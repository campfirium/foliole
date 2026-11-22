import type { DbPort } from './dbPort.js';
import { loadSyncGroupHistoryHorizon } from './syncGroupCoverageStore.js';
import { syncGroupLocalPublicationBlockReason } from './syncGroupLocalAdoption.js';
import {
  RECLAIMABLE_HISTORY_SQL,
  RECLAIMABLE_TOMBSTONES_SQL,
  reclaimHistoryStatements,
  reclaimTombstoneStatements
} from './syncHistoryCollectionSql.js';
import { RECLAIM_STATE_TOMBSTONE_STATEMENTS, reclaimableStateTombstonesSql,
  WATCHED_FOLDER_TABLE_SQL } from './syncStateTombstoneCollectionSql.js';

/** Each batch is its own short write so sync and edits are never held behind a large first cleanup. */
const BATCH = 200;

type Write = <T>(write: (db: DbPort) => Promise<T>) => Promise<T>;

async function reclaimBatch(db: DbPort, groupId: string, settledHorizon: string | undefined) {
  if (await syncGroupLocalPublicationBlockReason(db)) return null;
  const horizon = await loadSyncGroupHistoryHorizon(db, groupId);
  if (!horizon || horizon === settledHorizon) return null;
  const versions = (await db.query<{ version_id: string }>(RECLAIMABLE_HISTORY_SQL, [horizon, BATCH]))
    .map(row => row.version_id);
  if (versions.length) for (const sql of reclaimHistoryStatements(versions)) await db.run(sql, versions);
  const tombstones = (await db.query<{ node_id: string }>(RECLAIMABLE_TOMBSTONES_SQL, [horizon, BATCH]))
    .map(row => row.node_id);
  if (tombstones.length) for (const sql of reclaimTombstoneStatements(tombstones)) await db.run(sql, tombstones);
  const marks = await reclaimStateTombstones(db, horizon);
  return { versions: versions.length, tombstones: tombstones.length + marks, horizon };
}

async function reclaimStateTombstones(db: DbPort, horizon: string) {
  const hasWatchedFolders = (await db.query(WATCHED_FOLDER_TABLE_SQL)).length > 0;
  const marks = await db.query<{ object_type: string; object_id: string }>(
    reclaimableStateTombstonesSql(hasWatchedFolders), [horizon, BATCH]);
  for (const mark of marks) for (const sql of RECLAIM_STATE_TOMBSTONE_STATEMENTS) {
    await db.run(sql, [mark.object_type, mark.object_id]);
  }
  return marks.length;
}

/**
 * Group lines a caller has already drained, keyed by its own choice of group and library.
 * The whole-table scan finds nothing new until the line moves, so an unmoved line is not scanned again;
 * history released under an unmoved line waits for the next line, which is only a storage delay.
 */
export type SettledSyncHistoryHorizons = Map<string, string>;

/**
 * After a completed round: drop history and deletions that every active member already owns.
 * Nothing is coordinated with peers; history no longer takes part in comparison.
 */
export async function collectSyncGroupHistory(write: Write, groupId: string,
  settled?: { horizons: SettledSyncHistoryHorizons; key: string }) {
  const total = { versions: 0, tombstones: 0 };
  for (;;) {
    const batch = await write(db => db.transaction(tx => reclaimBatch(tx, groupId, settled?.horizons.get(settled.key))));
    if (!batch) return total;
    total.versions += batch.versions;
    total.tombstones += batch.tombstones;
    if (batch.versions < BATCH && batch.tombstones < BATCH) {
      settled?.horizons.set(settled.key, batch.horizon);
      return total;
    }
  }
}
