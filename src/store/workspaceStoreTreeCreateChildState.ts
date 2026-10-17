import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { normalizePushQueuePriority } from '../features/review/model/unifiedPushQueueRules';

import { createNewItemReviewProfiles } from './newItemReviewSlots';
import {
  insertNodeBlockAsFirstChild,
  insertNodeBlockUnderParent
} from './workspaceNodeTreeOrder';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { applySequentialReadingCreatedChild } from './workspaceStoreTreeSequentialReading';
import { resolveCreatedNodeTitleState } from './workspaceUntitledNodeTitle';

type NodeSnapshot = WorkspaceState['nodesById'][string];

function createCreatedChildNode(args: {
  content: string;
  kind: NodeKind;
  nodeId: string;
  parentNodeId: string;
  priority?: number | null;
  review: NodeSnapshot['review'];
  specialKind?: NodeSnapshot['specialKind'];
  timestamp: string;
  title: string;
}) {
  return {
    id: args.nodeId,
    parentNodeId: args.parentNodeId,
    kind: args.kind,
    ...(args.specialKind ? { specialKind: args.specialKind } : {}),
    ...(args.priority !== undefined
      ? { priority: args.priority === null ? null : normalizePushQueuePriority(args.priority) }
      : {}),
    title: args.title,
    hasContent: args.content.trim().length > 0,
    hideTitleHeading: false,
    content: args.content,
    anchorLink: null,
    hasReveal: args.kind === 'item',
    reveal: args.kind === 'item' ? '' : null,
    review: args.review,
    createdAt: args.timestamp,
    updatedAt: args.timestamp
  };
}

export function buildCreatedChildState(
  state: WorkspaceState,
  parentNodeId: string,
  nodeId: string,
  content: string,
  kind: NodeKind,
  timestamp: string,
  options?: import('./workspaceStoreTypes').WorkspaceNodeCreationOptions,
  specialKind?: NodeSnapshot['specialKind']
) {
  const untitledState = resolveCreatedNodeTitleState(deriveNodeTitleFromContent(content), parentNodeId, state);
  const reviewProfiles = kind === 'item'
    ? createNewItemReviewProfiles({ batchSize: 1, nodesById: state.nodesById, now: timestamp })
    : [];
  const nextNode = createCreatedChildNode({
    content,
    kind,
    nodeId,
    parentNodeId,
    ...(options?.priority !== undefined ? { priority: options.priority } : {}),
    review: reviewProfiles[0] ?? null,
    ...(specialKind ? { specialKind } : {}),
    timestamp,
    title: untitledState.title
  });
  const nextNodeWithImages = options?.newImageReferences?.length
    ? { ...nextNode, pendingImageReferences: options.newImageReferences } : nextNode;
  const nextNodeOrder =
    parentNodeId === INBOX_NODE_ID
      ? insertNodeBlockAsFirstChild(state.nodeOrder, [nodeId], parentNodeId, state.nodesById)
      : insertNodeBlockUnderParent(state.nodeOrder, [nodeId], parentNodeId, state.nodesById);
  const sequentialState = applySequentialReadingCreatedChild({
    nextNode: nextNodeWithImages,
    nextNodeOrder,
    nextNodesById: { ...state.nodesById, [nodeId]: nextNodeWithImages },
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
