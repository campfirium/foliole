import type { PdfAnchorLocator } from '../features/nodes/model/nodeTypes';
import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

import type { WorkspaceState } from './workspaceStore';
import { applyCreatedNode, buildAnnotationCreatePatch } from './workspaceStoreCreateActions';

type WorkspaceSet = (partial: Partial<WorkspaceState> | WorkspaceState | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;

function createExcerptNode(args: {
  attachmentId: string;
  locator: PdfAnchorLocator;
  nodeId: string;
  page: number;
  parentNodeId: string;
  timestamp: string;
}): WorkspaceState['nodesById'][string] {
  return {
    id: args.nodeId, parentNodeId: args.parentNodeId, kind: 'topic',
    title: `Image excerpt · Page ${args.page}`, isTitleManual: false, hasContent: true,
    content: `![Image excerpt](asset://${args.attachmentId}.png)`,
    anchorLink: { id: `anchor-${crypto.randomUUID()}`, kind: 'image-excerpt', locator: args.locator },
    imageRegions: null, hasReveal: false, reveal: null, review: null,
    createdAt: args.timestamp, updatedAt: args.timestamp
  };
}

export function createPdfImageExcerptAction(
  set: WorkspaceSet,
  syncCreation: (args: {
    activeNodeId: string;
    attachmentId: string;
    bytesBase64: string;
    node: WorkspaceState['nodesById'][string];
    nodeOrder: string[];
    position: number;
  }) => Promise<WorkspaceNodeMutationPatchResult | null>,
  get?: () => WorkspaceState
): NonNullable<WorkspaceState['createPdfImageExcerpt']> {
  return async (parentNodeId, page, locator, attachmentId, bytesBase64) => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    let node: WorkspaceState['nodesById'][string] | null = null;
    let nodeOrder: string[] | null = null;
    set((state) => {
      if (!state.nodesById[parentNodeId]) return state;
      node = createExcerptNode({ attachmentId, locator, nodeId, page, parentNodeId, timestamp });
      const next = buildAnnotationCreatePatch({
        createdNode: node,
        parentNodeId,
        state,
        untitledSequenceByParent: state.untitledSequenceByParent
      });
      nodeOrder = next.nodeOrder;
      return next.patch;
    });
    const handlers = {
      syncNodeContent: () => undefined,
      syncNodeOrder: () => undefined,
      syncNodeCreation: async (createdNode: NonNullable<typeof node>, order: string[] = []) => syncCreation({
        activeNodeId: parentNodeId,
        attachmentId,
        bytesBase64,
        node: createdNode,
        nodeOrder: order,
        position: order.indexOf(createdNode.id)
      })
    };
    return applyCreatedNode({
      activeNodeId: parentNodeId,
      handlers,
      node,
      nodeId,
      nodeOrder,
      requireRuntimeConfirmation: true,
      set,
      ...(get ? { get } : {})
    });
  };
}
