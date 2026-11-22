import { buildWorkspaceMetadataMutation } from '../../../../store/workspaceNodeMetadataMutation';
import { maintainWorkspaceSnapshotSequentialReading } from '../../../../store/workspaceSnapshotSequentialReading';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { commitCompanionNodeHistoryWithDb, createCompanionMetadataVersions } from './companionNodeHistory';
import type { CompanionBatchTarget } from './companionWorkspaceBatchTrash';
import { deriveCompanionWriteNodeOrder } from './companionWriteNodeOrder';
import { companionWriteNodeOrder, loadCompanionWriteNodes } from './companionWriteNodes';
import { iosCompanionHostName } from './iosCompanionMutationState';

/** Moves the selected nodes under one parent as a single undoable action. */
export function moveCompanionBatch(targets: readonly CompanionBatchTarget[], parentNodeId: string | null) {
  let readingNodeIds: string[] = [];
  return runCompanionHistoryMutation(async db => {
    // The moved nodes, their ancestors and the target's ancestors suffice unless a Sequential Reading topic is in reach;
    // the moved subtrees travel unchanged, so they are probed, never read.
    const host = await iosCompanionHostName(db);
    const narrow = await loadCompanionWriteNodes(db, [], { host, attachments: false, sequentialReading: true, keptIds: targets.map(target => target.id), pathIds: [parentNodeId] });
    const snapshot = narrow ? null : await loadIosCompanionWorkspaceSnapshot(db);
    if (!narrow && !snapshot) throw new Error('workspace_unavailable');
    const before = narrow ?? snapshot!.nodesById;
    if (targets.some(({ id, version }) => before[id]?.currentVersionId !== version)) {
      throw new Error('workspace_batch_selection_changed');
    }
    const now = new Date().toISOString();
    let after = before;
    const moved: string[] = [];
    const changed = new Map<string, (typeof before)[string]>();
    for (const { id } of targets) {
      if (after[id]?.parentNodeId === parentNodeId) continue;
      const mutation = buildWorkspaceMetadataMutation({ type: 'move', nodeId: id, parentNodeId }, after, now);
      after = { ...after, ...Object.fromEntries(mutation.nodes.map(node => [node.id, node])) };
      for (const node of mutation.nodes) changed.set(node.id, node);
      moved.push(id);
    }
    if (!moved.length) return [];
    const readings = maintainWorkspaceSnapshotSequentialReading({ before, after, changedNodeIds: moved,
      nodeOrder: snapshot ? await deriveCompanionWriteNodeOrder(db, snapshot, after) : companionWriteNodeOrder(before), now });
    const records = await createCompanionMetadataVersions(db, [...changed.values()], host);
    await commitCompanionNodeHistoryWithDb(db, records, 'Move', 'local_mutation', null, readings, undefined, host);
    readingNodeIds = readings.map(change => change.nodeId);
    return [...new Set([...moved, ...changed.keys()])];
  // The move names every node and Sequential Reading change it made, even after a whole-library read,
  // so the refresh merges them and only falls back when the merge cannot be proven.
  }, nodeIds => ({ kind: 'nodes', nodeIds, structure: true, metadata: true, ...(readingNodeIds.length ? { readingNodeIds } : {}) }));
}
