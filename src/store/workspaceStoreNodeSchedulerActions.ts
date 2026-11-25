import { normalizeNodeDesiredRetention } from '../features/nodes/model/nodeReviewSettings';
import { normalizePushQueuePriority } from '../features/review/model/unifiedPushQueueRules';
import { patchWorkspaceRecord } from '../shared/workspaceRecordPatch';

import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

export function createUpdateNodePriorityAction(set: WorkspaceSet): WorkspaceState['updateNodePriority'] {
  return (nodeId, priority, enforcePriority) => {
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node) {
        return state;
      }
      const nextNode = {
        ...node,
        priority: priority === null ? null : normalizePushQueuePriority(priority),
        ...(node.kind === 'folder' && (enforcePriority !== undefined || priority === null)
          ? { enforcePriority: priority !== null && enforcePriority === true } : {}),
        updatedAt: new Date().toISOString()
      };
      nextNodeForSync = nextNode;
      return { nodesById: patchWorkspaceRecord(state.nodesById, { [nodeId]: nextNode }) };
    });
    if (nextNodeForSync) {
      syncNodeContentToRuntime(nextNodeForSync);
    }
  };
}

export function createUpdateNodeDesiredRetentionAction(
  set: WorkspaceSet
): WorkspaceState['updateNodeDesiredRetention'] {
  return (nodeId, desiredRetention) => {
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node) {
        return state;
      }
      const nextNode = {
        ...node,
        desiredRetention:
          desiredRetention === null ? null : normalizeNodeDesiredRetention(desiredRetention),
        updatedAt: new Date().toISOString()
      };
      nextNodeForSync = nextNode;
      return { nodesById: patchWorkspaceRecord(state.nodesById, { [nodeId]: nextNode }) };
    });
    if (nextNodeForSync) {
      syncNodeContentToRuntime(nextNodeForSync);
    }
  };
}

export function createUpdateNodeShortTermAction(set: WorkspaceSet): WorkspaceState['updateNodeShortTerm'] {
  return (nodeId, enableShortTerm) => {
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node) {
        return state;
      }
      const nextNode = {
        ...node,
        enableShortTerm: enableShortTerm === null ? null : enableShortTerm === true,
        updatedAt: new Date().toISOString()
      };
      nextNodeForSync = nextNode;
      return { nodesById: patchWorkspaceRecord(state.nodesById, { [nodeId]: nextNode }) };
    });
    if (nextNodeForSync) {
      syncNodeContentToRuntime(nextNodeForSync);
    }
  };
}
