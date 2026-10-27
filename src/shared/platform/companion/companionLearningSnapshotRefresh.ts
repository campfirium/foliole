import { canMergeWorkspaceContentProjection } from '../../../../lib/core/database/workspaceContentProjection';
import type { WorkspaceSnapshot } from '../../../../lib/core/database/workspaceSnapshot';
import { workspaceSnapshotValueEqual } from '../../../../lib/core/database/workspaceSnapshotValueEqual';
import type { DbPort } from '../../../../lib/core/sync/dbPort';
import { patchWorkspaceRecord } from '../../workspaceRecordPatch';

import { iosCompanionHostName } from './runtime/iosCompanionMutationState';
import { loadCompanionSnapshotNodeRows } from './sync/workspace-state/companionSnapshotNodeRows';
import { buildIosWorkspaceNodes } from './sync/workspace-state/iosCompanionWorkspaceSnapshotRows';

// Learning commits do not change documents, attachment membership or view state.
// Keep those published facts; structural changes retain the full-reader contract.
export async function mergeCompanionLearningSnapshot(db: DbPort, snapshot: WorkspaceSnapshot,
  reviewed: readonly string[], reading: readonly string[]) {
  const ids = [...new Set([...reviewed, ...reading])];
  if (!ids.length) return snapshot;
  const facts = buildIosWorkspaceNodes(await loadCompanionSnapshotNodeRows(db,
    await iosCompanionHostName(db), ids, true));
  for (const [id, node] of Object.entries(facts.nodesById)) {
    const before = snapshot.nodesById[id];
    if (!before) return null;
    if (before.attachments === undefined) delete node.attachments;
    else node.attachments = before.attachments;
    if (before.readwiseRemoteLifecycle === undefined) delete node.readwiseRemoteLifecycle;
    else node.readwiseRemoteLifecycle = before.readwiseRemoteLifecycle;
  }
  const contentKeys = ['currentVersionId', 'bodyBlobHash', 'openingText', 'bodyStatus', 'hasContent', 'hasReveal'] as const;
  const unchanged = canMergeWorkspaceContentProjection(snapshot, facts.nodesById, ids, reviewed, reading) &&
    ids.every(id => contentKeys.every(key => workspaceSnapshotValueEqual(snapshot.nodesById[id]?.[key], facts.nodesById[id]?.[key])));
  if (!unchanged) return null;
  const changes: WorkspaceSnapshot['nodesById'] = {};
  for (const id of ids) {
    const before = snapshot.nodesById[id]!;
    const after = facts.nodesById[id]!;
    const reviewChanged = reviewed.includes(id) && !workspaceSnapshotValueEqual(before.review, after.review);
    const readingChanged = reading.includes(id) && !workspaceSnapshotValueEqual(before.reading, after.reading);
    if (reviewChanged || readingChanged) changes[id] = { ...before,
      ...(reviewChanged ? { review: after.review } : {}), ...(readingChanged ? { reading: after.reading } : {}) };
  }
  if (!Object.keys(changes).length) return snapshot;
  const next = { ...snapshot, nodesById: patchWorkspaceRecord(snapshot.nodesById, changes) };
  delete next.virtualResultIdsByNodeId;
  return next;
}
