import type { Node } from '../features/nodes/model/nodeTypes';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { pushWorkspaceUndoEntry } from './workspaceActionHistory';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import { buildSequentialReadingMaintenancePatch } from './workspaceSequentialReadingMaintenance';
import { createTopicShelveHistoryEntry } from './workspaceShelveActionHistory';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

function isShelvableTopic(node: Node | undefined, state: WorkspaceState): node is Node {
  return Boolean(
    node &&
      node.kind === 'topic' &&
      !node.specialKind &&
      !node.anchorLink &&
      !state.trashedNodeIds.includes(node.id)
  );
}

function createSetNodeShelvedAtAction(
  set: WorkspaceSet,
  mode: 'shelve' | 'unshelve'
): WorkspaceState['shelveNode'] | WorkspaceState['unshelveNode'] {
  return (nodeId, now = new Date().toISOString()) => {
    let changed = false;
    let nextNodesForSync: Node[] = [];
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!isShelvableTopic(node, state)) {
        return state;
      }
      const beforeShelvedAt = node.shelvedAt ?? null;
      const afterShelvedAt = mode === 'shelve' ? now : null;
      if (beforeShelvedAt === afterShelvedAt || (mode === 'unshelve' && !beforeShelvedAt)) {
        return state;
      }
      changed = true;
      const nextNode = { ...node, shelvedAt: afterShelvedAt, updatedAt: now };
      const nextNodesById = {
        ...state.nodesById,
        [nodeId]: nextNode
      };
      const sequentialPatch = buildSequentialReadingMaintenancePatch({
        changedRootNodeIds: [nodeId],
        defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
        nodeOrder: state.nodeOrder,
        nodesById: nextNodesById,
        now,
        previousNodesById: state.nodesById
      });
      const finalNodesById = sequentialPatch?.nodesById ?? nextNodesById;
      nextNodesForSync = [
        nextNode,
        ...(sequentialPatch?.changes ?? [])
          .map((change) => finalNodesById[change.nodeId])
          .filter((changedNode): changedNode is Node => Boolean(changedNode))
      ];
      return {
        appActionHistory: pushWorkspaceUndoEntry(
          state.appActionHistory,
          createTopicShelveHistoryEntry({
            afterShelvedAt,
            beforeShelvedAt,
            nodeId,
            ...(sequentialPatch?.changes.length ? { relatedReadings: sequentialPatch.changes } : {})
          })
        ),
        nodesById: finalNodesById
      };
    });
    if (nextNodesForSync.length > 0) {
      nextNodesForSync.forEach((node) => syncNodeContentToRuntime(node));
    }
    return changed;
  };
}

export function createShelveNodeAction(set: WorkspaceSet): WorkspaceState['shelveNode'] {
  return createSetNodeShelvedAtAction(set, 'shelve');
}

export function createUnshelveNodeAction(set: WorkspaceSet): WorkspaceState['unshelveNode'] {
  return createSetNodeShelvedAtAction(set, 'unshelve');
}
