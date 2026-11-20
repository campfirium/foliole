import { buildWorkspaceMetadataMutation } from '../../../../store/workspaceNodeMetadataMutation';
import { maintainWorkspaceSnapshotSequentialReading } from '../../../../store/workspaceSnapshotSequentialReading';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { commitCompanionNodeHistoryWithDb, createCompanionMetadataVersion } from './companionNodeHistory';
import type { CompanionBatchTarget } from './companionWorkspaceBatchTrash';
import { iosCompanionHostName } from './iosCompanionMutationState';

/** Moves the selected nodes under one parent as a single undoable action. */
export function moveCompanionBatch(targets: readonly CompanionBatchTarget[], parentNodeId: string | null) {
  return runCompanionHistoryMutation(async db => {
    const snapshot = await loadIosCompanionWorkspaceSnapshot(db);
    if (!snapshot) throw new Error('workspace_unavailable');
    const before = snapshot.nodesById;
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
      nodeOrder: snapshot.nodeOrder, now });
    const host = await iosCompanionHostName(db);
    const records = await Promise.all([...changed.values()].map(node => createCompanionMetadataVersion(db, node, host)));
    await commitCompanionNodeHistoryWithDb(db, records, 'Move', 'local_mutation', null, readings);
    return moved;
  }, nodeIds => ({ kind: 'nodes', nodeIds, structure: true }));
}
