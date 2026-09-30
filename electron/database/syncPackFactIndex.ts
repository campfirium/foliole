import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { hashText } from '../../lib/core/sync/syncNodeResolution.js';
import {
  describeVersionFact,
  type SyncPackFactIndex,
  type SyncPackFactPage
} from '../../lib/core/sync/syncPackFactPresence.js';

import { selectDesktopSyncPackFactWindow } from './syncPackFactWindow.js';
import {
  loadSyncPackNodeVersionParentRows,
  iterateSyncPackNodeVersionRows
} from './syncPackNodeVersionRows.js';
import { loadPackRows } from './syncPackRows.js';

const MAX_FACTS_PER_KIND = 128;
const MAX_INDEX_BYTES = 256 * 1024;

export function loadDesktopSyncPackFactIndex(driver: DatabaseDriver, args: {
  fromStateSeq: number;
  frontierStateSeq?: number;
  sourceEpoch?: string;
}): SyncPackFactIndex {
  const window = selectDesktopSyncPackFactWindow(driver, args);
  const toStateSeq = window.toStateSeq;
  const base = loadPackRows(args.fromStateSeq, toStateSeq, driver);
  const versions: SyncPackFactPage['versions'] = [];
  for (const row of iterateSyncPackNodeVersionRows(driver, base.nodes)) {
    if (versions.length >= MAX_FACTS_PER_KIND) throw new Error('sync_pack_fact_index_over_budget');
    versions.push(describeVersionFact({ ...row,
      snapshot_metadata: snapshotMetadata(driver, row.version_id)
    }));
  }
  const page: SyncPackFactPage = {
    versions,
    parents: loadSyncPackNodeVersionParentRows(driver, versions),
    reviews: base.reviewLog
  };
  if (Object.values(page).some((facts) => facts.length > MAX_FACTS_PER_KIND)) {
    throw new Error('sync_pack_fact_index_over_budget');
  }
  const identity = {
    from_state_seq: args.fromStateSeq, to_state_seq: toStateSeq,
    frontier_state_seq: window.frontierStateSeq, source_epoch: window.sourceEpoch,
    ...page
  };
  const serialized = JSON.stringify(identity);
  if (Buffer.byteLength(serialized) > MAX_INDEX_BYTES) {
    throw new Error('sync_pack_fact_index_over_budget');
  }
  return { ...identity, index_id: hashText(serialized) };
}

function snapshotMetadata(driver: DatabaseDriver, versionId: string) {
  const row = driver.queryOne<{ metadata: string }>(
    `SELECT json_remove(snapshot_json, '$.content') AS metadata
     FROM node_sync_versions WHERE version_id = ?`, [versionId]
  );
  if (!row || typeof row.metadata !== 'string') {
    throw new Error(`sync_pack_node_version_missing:${versionId}`);
  }
  return row.metadata;
}
