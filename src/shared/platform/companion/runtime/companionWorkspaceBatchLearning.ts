import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import type { WorkspaceRelatedReading } from '../../../../store/workspaceNodeMetadataHistory';
import { buildWorkspaceMetadataMutation } from '../../../../store/workspaceNodeMetadataMutation';
import { maintainWorkspaceSnapshotSequentialReading } from '../../../../store/workspaceSnapshotSequentialReading';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { commitCompanionNodeHistoryWithDb, createCompanionMetadataVersions } from './companionNodeHistory';
import type { CompanionBatchTarget } from './companionWorkspaceBatchTrash';
import { deriveCompanionWriteNodeOrder } from './companionWriteNodeOrder';
import { companionWriteNodeOrder, loadCompanionWriteNodes } from './companionWriteNodes';
import { iosCompanionHostName } from './iosCompanionMutationState';

export const companionRelearnHistoryTitle = 'Relearn';

/** Takes the selected topics off the shelf as one undoable action, keeping Sequential Reading in step as a single unshelve does. */
export function unshelveCompanionBatch(targets: readonly CompanionBatchTarget[]) {
  let readingNodeIds: string[] = [];
  return runCompanionHistoryMutation(async db => {
    const host = await iosCompanionHostName(db);
    const ids = targets.map(target => target.id);
    const narrow = await loadCompanionWriteNodes(db, [], { host, attachments: false, sequentialReading: true, keptIds: ids });
    const snapshot = narrow ? null : await loadIosCompanionWorkspaceSnapshot(db);
    if (!narrow && !snapshot) throw new Error('workspace_unavailable');
    const before = narrow ?? snapshot!.nodesById;
    if (targets.some(({ id, version }) => before[id]?.currentVersionId !== version)) throw new Error('workspace_batch_selection_changed');
    const now = new Date().toISOString();
    let after = before;
    const changed: string[] = [];
    for (const id of ids) {
      if (!after[id]?.shelvedAt) continue;
      const mutation = buildWorkspaceMetadataMutation({ type: 'unshelve', nodeId: id }, after, now);
      after = { ...after, ...Object.fromEntries(mutation.nodes.map(node => [node.id, node])) };
      changed.push(id);
    }
    if (!changed.length) return [];
    const readings = maintainWorkspaceSnapshotSequentialReading({ before, after, changedNodeIds: changed,
      nodeOrder: snapshot ? await deriveCompanionWriteNodeOrder(db, snapshot, after) : companionWriteNodeOrder(before), now });
    const records = await createCompanionMetadataVersions(db, changed.map(id => after[id]!), host);
    await commitCompanionNodeHistoryWithDb(db, records, 'unshelve', 'local_mutation', null, readings, undefined, host);
    readingNodeIds = readings.map(change => change.nodeId);
    return changed;
  }, nodeIds => ({ kind: 'nodes', nodeIds, structure: true, metadata: true, ...(readingNodeIds.length ? { readingNodeIds } : {}) }));
}

/**
 * Relearns the selected removed topics as one undoable action, as the desktop Relearn does for topics:
 * their reading progress is cleared and any shelf mark lifted; they stay in Trash.
 */
export function relearnCompanionBatch(targets: readonly CompanionBatchTarget[]) {
  let readingNodeIds: string[] = [];
  return runCompanionHistoryMutation(async db => {
    const host = await iosCompanionHostName(db);
    const nodes = await Promise.all(targets.map(target => loadCompanionWorkspaceNodeFromDb(db, target.id, host)));
    if (targets.some((target, index) => nodes[index]?.currentVersionId !== target.version)) throw new Error('workspace_batch_selection_changed');
    const now = new Date().toISOString();
    const readings: WorkspaceRelatedReading[] = [];
    const changed = nodes.flatMap(node => {
      if (!node || node.kind !== 'topic' || node.id.startsWith('special-') || (!node.reading && !node.shelvedAt)) return [];
      if (node.reading) readings.push({ nodeId: node.id, beforeReading: node.reading, afterReading: null });
      return [{ ...node, shelvedAt: null, updatedAt: now }];
    });
    if (!changed.length) return [];
    const records = await createCompanionMetadataVersions(db, changed, host);
    await commitCompanionNodeHistoryWithDb(db, records, companionRelearnHistoryTitle, 'local_mutation', null, readings, undefined, host);
    readingNodeIds = readings.map(change => change.nodeId);
    return changed.map(node => node.id);
  }, nodeIds => ({ kind: 'nodes', nodeIds, metadata: true, ...(readingNodeIds.length ? { readingNodeIds } : {}) }));
}
