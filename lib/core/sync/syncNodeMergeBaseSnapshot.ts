import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { parseManualChildOrder, stringifyManualChildOrder } from '../nodes/manualChildOrder.js';

import type { DbPort } from './dbPort.js';
import { loadMergeBaseCandidates, storedSyncNodeVersionBody, type StoredSyncNodeVersionRow } from './syncNodeGraph.js';

type Snapshot = NativeSyncNodeRecord['snapshot'];

/**
 * Loads the snapshot a node metadata merge compares both heads against.
 * Heads merged from the same origins in different orders have several best common
 * ancestors; only facts every one of them shares can serve as the base.
 */
export async function loadMergeBaseSnapshot(port: DbPort, leftId: string, rightId: string, scope: 'folder' | 'item') {
  const candidates = await loadMergeBaseCandidates(port, leftId, rightId);
  if (candidates.length === 0) return null;
  const rows = await port.query<StoredSyncNodeVersionRow>(
    `SELECT * FROM node_sync_versions WHERE version_id IN (${candidates.map(() => '?').join(', ')})
     ORDER BY version_id`, candidates);
  for (const row of rows) {
    if (storedSyncNodeVersionBody(row) === null) {
      throw new Error(`sync_${scope}_merge_base_body_unavailable:${row.version_id}`);
    }
  }
  const snapshots = rows.map((row) => JSON.parse(row.snapshot_json) as Snapshot);
  if (candidates.length === 1) return snapshots[0] ?? null;
  return snapshots.length === candidates.length ? sharedSnapshot(snapshots) : null;
}

function sharedSnapshot(snapshots: Snapshot[]) {
  const [first, ...rest] = snapshots as [Snapshot, ...Snapshot[]];
  const shared: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(first)) {
    if (rest.every((snapshot) => JSON.stringify((snapshot as unknown as Record<string, unknown>)[key]) ===
      JSON.stringify(value))) shared[key] = value;
  }
  const members = snapshots.map((snapshot) => new Set(parseManualChildOrder(snapshot.manual_child_order) ?? []));
  shared.manual_child_order = stringifyManualChildOrder(
    [...members[0]!].filter((id) => members.every((set) => set.has(id))));
  return shared as unknown as Snapshot;
}
