import { collectTopicDismissIds } from '../../../../features/nodes/model/nodeDismissTargets';
import { collectWorkspaceDismissChanges } from '../../../../store/workspaceDismissChanges';
import type { WorkspaceNodeMetadataHistoryEntry, WorkspaceRelatedReading } from '../../../../store/workspaceNodeMetadataHistory';
import type { WorkspaceState } from '../../../../store/workspaceStore';
import { createCompanionUuid } from '../../companionUuid';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { appendCompanionFlowHistory, companionFlowHistoryKey } from './companionFlowHistoryStore';
import { writeCompanionHistoryReadings } from './companionHistoryLearning';
import type { CompanionBatchTarget } from './companionWorkspaceBatchTrash';
import { companionWriteNodeOrder, loadCompanionWriteNodes } from './companionWriteNodes';
import { iosCompanionHostName } from './iosCompanionMutationState';

export const companionDismissTopicHistoryTitle = 'Dismiss Topic';

/**
 * Dismisses a topic and every eligible topic and extract below it as one undoable action, as the desktop
 * "Dismiss topic" does: only reading progress changes, Sequential Reading moves on, and nothing leaves the library.
 */
export function dismissCompanionTopicBranch(target: CompanionBatchTarget) {
  let readingNodeIds: string[] = [];
  return runCompanionHistoryMutation(async db => {
    const host = await iosCompanionHostName(db);
    const narrow = await loadCompanionWriteNodes(db, [target.id], { host, attachments: false, sequentialReading: true });
    const snapshot = narrow ? null : await loadIosCompanionWorkspaceSnapshot(db);
    if (!narrow && !snapshot) throw new Error('workspace_unavailable');
    const nodesById = (narrow ?? snapshot!.nodesById) as unknown as WorkspaceState['nodesById'];
    const root = nodesById[target.id];
    if (root?.currentVersionId !== target.version) throw new Error('workspace_batch_selection_changed');
    if (root.kind !== 'topic' || root.deletedAt) return [];
    const state = {
      nodesById,
      nodeOrder: snapshot ? snapshot.nodeOrder : companionWriteNodeOrder(narrow!),
      trashedNodeIds: snapshot ? snapshot.trashedNodeIds : Object.values(nodesById).filter(node => node.deletedAt).map(node => node.id)
    };
    const { changes } = collectWorkspaceDismissChanges({ nodeIds: collectTopicDismissIds(target.id, nodesById),
      now: new Date().toISOString(), state });
    const relatedReadings = changes as WorkspaceRelatedReading[];
    if (!relatedReadings.length) return [];
    await writeCompanionHistoryReadings(db, relatedReadings, 'redo');
    const entry: WorkspaceNodeMetadataHistoryEntry = { type: 'nodes.change', id: createCompanionUuid(),
      title: companionDismissTopicHistoryTitle, rootNodeId: target.id, subtreeNodeIds: null, changes: [], orders: [],
      relatedReadings, beforeSession: null, afterSession: null };
    await appendCompanionFlowHistory(db, companionFlowHistoryKey(host), entry);
    readingNodeIds = relatedReadings.map(change => change.nodeId);
    return readingNodeIds;
  }, () => ({ kind: 'nodes', nodeIds: [], readingNodeIds }));
}
