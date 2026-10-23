import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { parseManualChildOrder, stringifyManualChildOrder } from '../nodes/manualChildOrder.js';

import type { DbPort } from './dbPort.js';
import { loadMergeBaseCandidates, storedSyncNodeVersionBody, type StoredSyncNodeVersionRow } from './syncNodeGraph.js';

type Snapshot = NativeSyncNodeRecord['snapshot'];

/**
 * Loads the snapshot and body a node merge compares both heads against.
 * Heads merged from the same origins in different orders have several best common
 * ancestors; only facts every one of them shares can serve as the base.
 */
export async function loadMergeBaseState(port: DbPort, leftId: string, rightId: string, scope: 'folder' | 'item') {
  const candidates = await loadMergeBaseCandidates(port, leftId, rightId);
  if (candidates.length === 0) return null;
  const rows = await port.query<StoredSyncNodeVersionRow>(
    `SELECT * FROM node_sync_versions WHERE version_id IN (${candidates.map(() => '?').join(', ')})
     ORDER BY version_id`, candidates);
  const bodies = rows.map((row) => {
    const body = storedSyncNodeVersionBody(row);
    if (body === null) throw new Error(`sync_${scope}_merge_base_body_unavailable:${row.version_id}`);
    return body;
  });
  if (rows.length !== candidates.length) return null;
  const snapshots = rows.map((row) => JSON.parse(row.snapshot_json) as Snapshot);
  const body = bodies.every((entry) => entry === bodies[0]) ? bodies[0]! : null;
  return { body, snapshot: candidates.length === 1 ? snapshots[0]! : sharedSnapshot(snapshots) };
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
