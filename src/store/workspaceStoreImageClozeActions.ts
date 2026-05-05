import { deriveNodeTitleForCloze } from '../features/nodes/model/deriveNodeTitle';

import { createDefaultReviewProfile } from './workspaceSeed';
import type { WorkspaceState } from './workspaceStore';
import { resolveCreatedNodeTitleState } from './workspaceUntitledNodeTitle';

type WorkspaceNode = WorkspaceState['nodesById'][string];

interface RuntimeSyncHandlers {
  syncNodeCreation: (node: WorkspaceNode) => void;
  syncNodeOrder: (nodeOrder: string[]) => void;
}

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

interface ImageClozeRegionInput {
  answer: string;
  height: number;
  width: number;
  x: number;
  y: number;
}

function normalizeImageClozeRegions(attachmentId: string, regions: ImageClozeRegionInput[]) {
  return regions
    .map((region) => ({
      ...region,
      answer: region.answer.trim()
    }))
    .filter(
      (region) =>
        attachmentId.length > 0 &&
        region.answer.length > 0 &&
        region.width > 0 &&
        region.height > 0
    );
}

function createImageClozeNode(
  parentNodeId: string,
  attachmentId: string,
  region: ImageClozeRegionInput,
  timestamp: string,
  state: WorkspaceState,
  untitledSequenceByParent: Record<string, number>
) {
  const nodeId = `node-${crypto.randomUUID()}`;
  const title = deriveNodeTitleForCloze('Image cloze', region.answer);
  const untitledState = resolveCreatedNodeTitleState(title, parentNodeId, {
    ...state,
    untitledSequenceByParent
  });
  const createdNode: WorkspaceNode = {
    id: nodeId,
    parentNodeId,
    kind: 'item',
    title: untitledState.title,
    hasContent: false,
    content: '',
    anchorLink: {
      id: `image-cloze-${crypto.randomUUID()}`,
      kind: 'cloze',
      locator: {
        attachmentId,
        height: region.height,
        width: region.width,
        x: region.x,
        y: region.y
      }
    },
    hasReveal: true,
    reveal: region.answer,
    review: createDefaultReviewProfile(timestamp),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  return {
    createdNode,
    untitledSequenceByParent: untitledState.untitledSequenceByParent
  };
}

export function createImageClozeNodesAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers,
  reconcileReviewSession: (state: WorkspaceState, activeNodeId?: string | null) => WorkspaceState['reviewSession']
): WorkspaceState['createImageClozeNodes'] {
  return (parentNodeId, attachmentId, regions) => {
    const normalizedAttachmentId = attachmentId.trim();
    const normalizedRegions = normalizeImageClozeRegions(normalizedAttachmentId, regions);

    if (normalizedRegions.length === 0) {
      return [];
    }

    const timestamp = new Date().toISOString();
    const createdNodes: WorkspaceNode[] = [];
    let nextNodeOrder: string[] | null = null;

    set((state) => {
      if (!state.nodesById[parentNodeId]) {
        return state;
      }

      const nextNodesById = { ...state.nodesById };
      let untitledSequenceByParent = state.untitledSequenceByParent;

      for (const region of normalizedRegions) {
        const nextNode = createImageClozeNode(
          parentNodeId,
          normalizedAttachmentId,
          region,
          timestamp,
          state,
          untitledSequenceByParent
        );
        untitledSequenceByParent = nextNode.untitledSequenceByParent;
        createdNodes.push(nextNode.createdNode);
        nextNodesById[nextNode.createdNode.id] = nextNode.createdNode;
      }

      nextNodeOrder = [...state.nodeOrder, ...createdNodes.map((node) => node.id)];
      return {
        nodeOrder: nextNodeOrder,
        nodesById: nextNodesById,
        untitledSequenceByParent,
        reviewSession: reconcileReviewSession({
          ...state,
          nodeOrder: nextNodeOrder,
          nodesById: nextNodesById,
          untitledSequenceByParent
        })
      };
    });

    if (!nextNodeOrder || createdNodes.length === 0) {
      return [];
    }

    for (const node of createdNodes) {
      handlers.syncNodeCreation(node);
    }
    handlers.syncNodeOrder(nextNodeOrder);
    return createdNodes.map((node) => node.id);
  };
}
