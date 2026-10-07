import type { DbPort } from './dbPort.js';
import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import { loadMergeBaseCandidates } from './syncNodeGraph.js';
import { buildVerifiedResolutionRecord } from './syncNodeResolutionBody.js';
import { mergeNodeSnapshot } from './syncNodeSnapshotMerge.js';
import { applyVerifiedSyncNodesWithDbPort } from './syncNodeVerifiedApplyExecutor.js';
import { loadCurrentVerifiedSyncNode, loadVerifiedSyncNodeVersion } from './syncNodeVerifiedGraph.js';
import { requireReadableVerifiedNode, type ReadableVerifiedSyncNode } from './topicTextVerifiedMerge.js';

/** Folder and item field merging keeps the existing whole-body three-way selection. */
export async function resolveVerifiedSnapshotConflict(db: DbPort, incoming: readonly VerifiedFramedSyncNode[], kind: 'folder' | 'item') {
  const ordered = [...incoming].sort((left, right) =>
    (left.metadata.version_id ?? '').localeCompare(right.metadata.version_id ?? ''));
  let current = await loadCurrentVerifiedSyncNode(db, ordered[0]!.metadata.object_id);
  if (!current?.metadata.version_id || ordered.some((record) => !record.metadata.version_id)) {
    throw new Error(`sync_${kind}_conflict_version_missing:${ordered[0]!.metadata.object_id}`);
  }
  const [state] = await db.query<{ sync_dirty: number }>('SELECT sync_dirty FROM nodes WHERE id = ?', [current.metadata.object_id]);
  if (state?.sync_dirty === 1) throw new Error(`sync_${kind}_local_change_unversioned:${current.metadata.object_id}`);
  for (const record of ordered) {
    const local = requireReadableVerifiedNode(current);
    const other = requireReadableVerifiedNode(record);
    const ids = await loadMergeBaseCandidates(db, local.metadata.version_id!, other.metadata.version_id!);
    if (ids.length > 1) throw new Error('sync_node_merge_base_ambiguous');
    const base = ids[0] ? await loadVerifiedSyncNodeVersion(db, ids[0], false) : null;
    if (base && base.body.kind !== 'readable') throw new Error(`sync_${kind}_merge_base_body_unavailable:${base.metadata.version_id}`);
    const merged = mergeNodeSnapshot(base?.metadata.snapshot ?? null, local.metadata, other.metadata, kind === 'folder');
    const winner = merged.winner === local.metadata ? local : other;
    const body = selectedBody(base?.body.kind === 'readable' ? base.body.ref.hash : null, local, other, winner);
    const resolution = await buildVerifiedResolutionRecord(db, [local, other], winner, body.body.ref, merged.snapshot);
    const applied = await applyVerifiedSyncNodesWithDbPort(db, [resolution], {
      includeAlreadyApplied: true, operation: 'local_mutation'
    });
    if (!applied.appliedIds.includes(local.metadata.object_id)) throw new Error(`sync_${kind}_resolution_not_applied:${local.metadata.object_id}`);
    current = resolution;
  }
  return current;
}

function selectedBody(baseHash: string | null, left: ReadableVerifiedSyncNode, right: ReadableVerifiedSyncNode,
  winner: ReadableVerifiedSyncNode) {
  if (baseHash === null) return winner;
  const leftChanged = left.body.ref.hash !== baseHash;
  const rightChanged = right.body.ref.hash !== baseHash;
  if (leftChanged && !rightChanged) return left;
  if (rightChanged && !leftChanged) return right;
  return winner;
}
