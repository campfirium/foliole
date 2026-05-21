import { pushEditorOperationEntry } from '../features/editor/model/editorOperationHistory';
import type { ImageClozeDraftRegion, ImageClozeSourcePayload } from '../features/image-cloze/model/imageCloze';
import { deriveNodeTitleForCloze } from '../features/nodes/model/deriveNodeTitle';

import { createEditorAnnotationCreateEntry } from './workspaceEditorAnnotationOperationEntry';
import {
  normalizeImageClozeRegions,
  normalizeImageClozeSourcePayload,
  updateParentNodeImageRegions
} from './workspaceImageClozeCreationHelpers';
import { createDefaultReviewProfile } from './workspaceSeed';
import type { WorkspaceState } from './workspaceStore';
import { resolveCreatedNodeTitleState } from './workspaceUntitledNodeTitle';

type WorkspaceNode = WorkspaceState['nodesById'][string];

interface RuntimeSyncHandlers {
  syncNodeContent: (node: WorkspaceNode) => void; syncNodeCreation: (node: WorkspaceNode) => void;
}

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

function createImageClozeNode(
  parentNodeId: string,
  attachmentId: string,
  sourcePayload: ImageClozeSourcePayload,
  regions: ImageClozeDraftRegion[],
  timestamp: string,
  state: WorkspaceState,
  untitledSequenceByParent: Record<string, number>
) {
  const primaryRegion = regions[0];
  if (!primaryRegion) {
    return null;
  }
  const nodeId = `node-${crypto.randomUUID()}`;
  const title = deriveNodeTitleForCloze(sourcePayload.promptContent, sourcePayload.revealContent);
  const untitledState = resolveCreatedNodeTitleState(title, parentNodeId, {
    ...state,
    untitledSequenceByParent
  });
  const createdNode: WorkspaceNode = {
    id: nodeId,
    parentNodeId,
    kind: 'item',
    title: untitledState.title,
    hasContent: sourcePayload.promptContent.trim().length > 0,
    content: sourcePayload.promptContent,
    anchorLink: {
      id: primaryRegion.id,
      kind: 'cloze',
      locator: {
        attachmentId,
        height: primaryRegion.height,
        width: primaryRegion.width,
        x: primaryRegion.x,
        y: primaryRegion.y
      }
    },
    imageRegions: [
      {
        attachmentId,
        regions: regions.map(({ id, height, width, x, y }) => ({ id, height, width, x, y }))
      }
    ],
    hasReveal: true,
    reveal: sourcePayload.revealContent,
    review: createDefaultReviewProfile(timestamp),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  return {
    createdNode,
    untitledSequenceByParent: untitledState.untitledSequenceByParent
  };
}

function createImageClozeNodeBatch(args: {
  normalizedAttachmentId: string;
  normalizedRegions: ImageClozeDraftRegion[];
  parentNodeId: string;
  sourcePayload: ImageClozeSourcePayload;
  state: WorkspaceState;
  timestamp: string;
}) {
  const nextNodesById = { ...args.state.nodesById };
  let untitledSequenceByParent = args.state.untitledSequenceByParent;
  const nextNode = createImageClozeNode(
    args.parentNodeId,
    args.normalizedAttachmentId,
    args.sourcePayload,
    args.normalizedRegions,
    args.timestamp,
    args.state,
    untitledSequenceByParent
  );
  if (!nextNode) {
    return {
      createdNodes: [],
      nextNodesById,
      untitledSequenceByParent
    };
  }
  untitledSequenceByParent = nextNode.untitledSequenceByParent;
  nextNodesById[nextNode.createdNode.id] = nextNode.createdNode;

  return {
    createdNodes: [nextNode.createdNode],
    nextNodesById,
    untitledSequenceByParent
  };
}

function syncCreatedImageClozeNodes(
  createdNodes: WorkspaceNode[],
  handlers: RuntimeSyncHandlers,
  nextNodeOrder: string[] | null,
  updatedParentNode: WorkspaceNode | null
) {
  if (!nextNodeOrder || createdNodes.length === 0) {
    return [];
  }
  for (const node of createdNodes) {
    handlers.syncNodeCreation(node);
  }
  if (updatedParentNode) {
    handlers.syncNodeContent(updatedParentNode);
  }
  return createdNodes.map((node) => node.id);
}

function buildImageClozeStateUpdate(args: {
  normalizedAttachmentId: string;
  normalizedRegions: ImageClozeDraftRegion[];
  normalizedSourcePayload: ReturnType<typeof normalizeImageClozeSourcePayload>;
  parentNodeId: string;
  reconcileReviewSession: (state: WorkspaceState, activeNodeId?: string | null) => WorkspaceState['reviewSession'];
  state: WorkspaceState;
  timestamp: string;
}) {
  const parentNode = args.state.nodesById[args.parentNodeId];
  if (!parentNode) {
    return args.state;
  }
  const batch = createImageClozeNodeBatch({
    normalizedAttachmentId: args.normalizedAttachmentId,
    normalizedRegions: args.normalizedRegions,
    parentNodeId: args.parentNodeId,
    sourcePayload: args.normalizedSourcePayload,
    state: args.state,
    timestamp: args.timestamp
  });
  const updatedParentNode = updateParentNodeImageRegions(
    parentNode,
    args.normalizedAttachmentId,
    args.normalizedRegions,
    args.timestamp
  );
  batch.nextNodesById[args.parentNodeId] = updatedParentNode;

  const nextNodeOrder = [...args.state.nodeOrder, ...batch.createdNodes.map((node) => node.id)];
  const operationEntry = createEditorAnnotationCreateEntry(
    batch.createdNodes,
    args.parentNodeId,
    nextNodeOrder
  );
  const nextState = {
    ...(operationEntry
      ? { editorOperationHistory: pushEditorOperationEntry(args.state.editorOperationHistory, operationEntry) }
      : {}),
    nodeOrder: nextNodeOrder,
    nodesById: batch.nextNodesById,
    untitledSequenceByParent: batch.untitledSequenceByParent
  };

  return {
    createdNodes: batch.createdNodes,
    nextNodeOrder,
    nextState: {
      ...nextState,
      reviewSession: args.reconcileReviewSession({
        ...args.state,
        ...nextState
      })
    },
    updatedParentNode
  };
}

export function createImageClozeNodesAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers,
  reconcileReviewSession: (state: WorkspaceState, activeNodeId?: string | null) => WorkspaceState['reviewSession']
): WorkspaceState['createImageClozeNodes'] {
  return (parentNodeId, attachmentId, sourcePayload, regions) => {
    const normalizedAttachmentId = attachmentId.trim();
    const normalizedRegions = normalizeImageClozeRegions(normalizedAttachmentId, regions);
    const normalizedSourcePayload = normalizeImageClozeSourcePayload(sourcePayload);

    if (normalizedRegions.length === 0 || normalizedSourcePayload.revealContent.length === 0) {
      return [];
    }

    const timestamp = new Date().toISOString();
    const createdNodes: WorkspaceNode[] = [];
    let updatedParentNode: WorkspaceNode | null = null;
    let nextNodeOrder: string[] | null = null;

    set((state) => {
      const nextResult = buildImageClozeStateUpdate({
        normalizedAttachmentId,
        normalizedRegions,
        normalizedSourcePayload,
        parentNodeId,
        reconcileReviewSession,
        state,
        timestamp
      });
      if (!('createdNodes' in nextResult)) {
        return state;
      }
      createdNodes.push(...nextResult.createdNodes);
      updatedParentNode = nextResult.updatedParentNode;
      nextNodeOrder = nextResult.nextNodeOrder;
      return nextResult.nextState;
    });

    return syncCreatedImageClozeNodes(createdNodes, handlers, nextNodeOrder, updatedParentNode);
  };
}
