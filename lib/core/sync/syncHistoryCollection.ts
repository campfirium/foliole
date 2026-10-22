import type { DbPort } from './dbPort.js';
import { loadSyncGroupHistoryHorizon } from './syncGroupCoverageStore.js';
import { syncGroupLocalPublicationBlockReason } from './syncGroupLocalAdoption.js';
import {
  RECLAIM_TOMBSTONE_STATEMENTS,
  RECLAIMABLE_HISTORY_SQL,
  RECLAIMABLE_TOMBSTONES_SQL,
  reclaimHistoryStatements
} from './syncHistoryCollectionSql.js';

/** Each batch is its own short write so sync and edits are never held behind a large first cleanup. */
const BATCH = 200;

type Write = <T>(write: (db: DbPort) => Promise<T>) => Promise<T>;

async function reclaimBatch(db: DbPort, groupId: string) {
  if (await syncGroupLocalPublicationBlockReason(db)) return null;
  const horizon = await loadSyncGroupHistoryHorizon(db, groupId);
  if (!horizon) return null;
  const versions = (await db.query<{ version_id: string }>(RECLAIMABLE_HISTORY_SQL, [horizon, BATCH]))
    .map(row => row.version_id);
  if (versions.length) for (const sql of reclaimHistoryStatements(versions)) await db.run(sql, versions);
  const tombstones = (await db.query<{ node_id: string }>(RECLAIMABLE_TOMBSTONES_SQL, [horizon, BATCH]))
    .map(row => row.node_id);
  for (const nodeId of tombstones) for (const sql of RECLAIM_TOMBSTONE_STATEMENTS) await db.run(sql, [nodeId]);
  return { versions: versions.length, tombstones: tombstones.length };
}

/**
 * After a completed round: drop history and deletions that every active member already owns.
 * Nothing is coordinated with peers; history no longer takes part in comparison.
 */
export async function collectSyncGroupHistory(write: Write, groupId: string) {
  const total = { versions: 0, tombstones: 0 };
  for (;;) {
    const batch = await write(db => db.transaction(tx => reclaimBatch(tx, groupId)));
    if (!batch) return total;
    total.versions += batch.versions;
    total.tombstones += batch.tombstones;
    if (batch.versions < BATCH && batch.tombstones < BATCH) return total;
  }
}
