import { hasNodeContent, type Node } from '../features/nodes/model/nodeTypes';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import {
  cloneReadingProfile,
  createTopicDismissHistoryEntry,
  pushWorkspaceUndoEntry
} from './workspaceActionHistory';
import { buildDismissedReadingProfile } from './workspaceReviewReading';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

export function createDismissNodeAction(set: WorkspaceSet): WorkspaceState['dismissNode'] {
  return (nodeId, now = new Date().toISOString()) => {
    let dismissed = false;
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (
        !node ||
        isProtectedRootNode(node) ||
        !hasNodeContent(node) ||
        !isReadingReviewItemNode(node) ||
        node.reading?.state === 'dismissed'
      ) {
        return state;
      }
      dismissed = true;
      const beforeReading = cloneReadingProfile(node.reading);
      const defaultPriority = getCurrentReviewSchedulerSettings().pushQueue.defaultPriority;
      const afterReading = buildDismissedReadingProfile({
        currentNodeId: nodeId,
        currentReading: node.reading,
        defaultPriority,
        nodesById: state.nodesById,
        now
      });
      const nextNode: Node = {
        ...node,
        reading: afterReading,
        updatedAt: now
      };
      nextNodeForSync = nextNode;
      return {
        appActionHistory: pushWorkspaceUndoEntry(
          state.appActionHistory,
          createTopicDismissHistoryEntry({
            afterReading,
            beforeReading,
            nodeId
          })
        ),
        nodesById: {
          ...state.nodesById,
          [nodeId]: nextNode
        }
      };
    });
    if (nextNodeForSync) {
      syncNodeContentToRuntime(nextNodeForSync);
    }
    return dismissed;
  };
}
