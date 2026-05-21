import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import {
  insertNodeBlockAsFirstChild,
  insertNodeBlockUnderParent
} from './workspaceNodeTreeOrder';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { applySequentialReadingCreatedChild } from './workspaceStoreTreeSequentialReading';
import { resolveCreatedNodeTitleState } from './workspaceUntitledNodeTitle';

type NodeSnapshot = WorkspaceState['nodesById'][string];

export function buildCreatedChildState(
  state: WorkspaceState,
  parentNodeId: string,
  nodeId: string,
  content: string,
  kind: NodeKind,
  timestamp: string,
  specialKind?: NodeSnapshot['specialKind']
) {
  const untitledState = resolveCreatedNodeTitleState(deriveNodeTitleFromContent(content), parentNodeId, state);
  const nextNode = {
    id: nodeId,
    parentNodeId,
    kind,
    ...(specialKind ? { specialKind } : {}),
    title: untitledState.title,
    hasContent: content.trim().length > 0,
    hideTitleHeading: false,
    content,
    anchorLink: null,
    hasReveal: false,
    reveal: null,
    review: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const nextNodeOrder =
    parentNodeId === INBOX_NODE_ID
      ? insertNodeBlockAsFirstChild(state.nodeOrder, [nodeId], parentNodeId, state.nodesById)
      : insertNodeBlockUnderParent(state.nodeOrder, [nodeId], parentNodeId, state.nodesById);
  const sequentialState = applySequentialReadingCreatedChild({
    nextNode,
    nextNodeOrder,
    nextNodesById: { ...state.nodesById, [nodeId]: nextNode },
    nodeId,
    state,
    timestamp
  });
  return {
    nextNode: sequentialState.nextNode,
    nextNodeOrder,
    patch: {
      activeNodeId: nodeId,
      nodeOrder: nextNodeOrder,
      nodesById: sequentialState.nodesById,
      untitledSequenceByParent: untitledState.untitledSequenceByParent,
      reviewSession: reconcileReviewSession(
        {
          ...state,
          activeNodeId: nodeId,
          nodeOrder: nextNodeOrder,
          nodesById: sequentialState.nodesById,
          untitledSequenceByParent: untitledState.untitledSequenceByParent
        },
        nodeId
      )
    }
  };
}
