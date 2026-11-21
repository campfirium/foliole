import { buildWorkspaceMetadataMutation } from '../../../../store/workspaceNodeMetadataMutation';
import { maintainWorkspaceSnapshotSequentialReading } from '../../../../store/workspaceSnapshotSequentialReading';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { commitCompanionNodeHistoryWithDb, createCompanionMetadataVersion } from './companionNodeHistory';
import type { CompanionBatchTarget } from './companionWorkspaceBatchTrash';
import { loadCompanionWriteNodes } from './companionWriteNodes';
import { iosCompanionHostName } from './iosCompanionMutationState';

/** Moves the selected nodes under one parent as a single undoable action. */
export function moveCompanionBatch(targets: readonly CompanionBatchTarget[], parentNodeId: string | null) {
  let narrowRead = false;
  return runCompanionHistoryMutation(async db => {
    // The moved subtrees, their ancestors and the target's ancestors suffice unless Sequential Reading is in reach.
    const narrow = await loadCompanionWriteNodes(db, targets.map(target => target.id), { sequentialReading: true, pathIds: [parentNodeId] });
    const snapshot = narrow ? null : await loadIosCompanionWorkspaceSnapshot(db);
    if (!narrow && !snapshot) throw new Error('workspace_unavailable');
    const before = narrow ?? snapshot!.nodesById;
    // Without Sequential Reading in reach the move changes only the nodes it names, so the refresh merges them.
    narrowRead = narrow !== null;
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
    const readings = snapshot ? maintainWorkspaceSnapshotSequentialReading({ before, after, changedNodeIds: moved,
      nodeOrder: snapshot.nodeOrder, now }) : [];
    const host = await iosCompanionHostName(db);
    const records = await Promise.all([...changed.values()].map(node => createCompanionMetadataVersion(db, node, host)));
    await commitCompanionNodeHistoryWithDb(db, records, 'Move', 'local_mutation', null, readings);
    return moved;
  }, nodeIds => ({ kind: 'nodes', nodeIds, structure: true, ...(narrowRead ? { metadata: true } : {}) }));
}
