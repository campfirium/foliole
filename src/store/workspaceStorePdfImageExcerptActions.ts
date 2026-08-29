import type { PdfAnchorLocator } from '../features/nodes/model/nodeTypes';
import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

import type { WorkspaceState } from './workspaceStore';
import { applyCreatedNode, buildAnnotationCreatePatch } from './workspaceStoreCreateActions';

type WorkspaceSet = (partial: Partial<WorkspaceState> | WorkspaceState | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;
const EXCERPT_TITLE_PATTERN = /^Excerpt (\d+)$/;

function createExcerptNode(args: {
  attachmentId: string;
  locator: PdfAnchorLocator;
  nodeId: string;
  parentNodeId: string;
  timestamp: string;
  title: string;
}): WorkspaceState['nodesById'][string] {
  return {
    id: args.nodeId, parentNodeId: args.parentNodeId, kind: 'topic',
    title: args.title, isTitleManual: false, hasContent: true,
    content: `![Image excerpt](asset://${args.attachmentId}.png)`,
    anchorLink: { id: `anchor-${crypto.randomUUID()}`, kind: 'image-excerpt', locator: args.locator },
    imageRegions: null, hasReveal: false, reveal: null, review: null,
    createdAt: args.timestamp, updatedAt: args.timestamp
  };
}

function resolveExcerptTitleState(parentNodeId: string, state: WorkspaceState) {
  const sequenceKey = `image-excerpt:${parentNodeId}`;
  const siblingNextSequence = Object.values(state.nodesById).reduce((next, node) => {
    if (node.parentNodeId !== parentNodeId || node.anchorLink?.kind !== 'image-excerpt') return next;
    const match = node.title.match(EXCERPT_TITLE_PATTERN);
    return match ? Math.max(next, Number.parseInt(match[1]!, 10) + 1) : next;
  }, 1);
  const nextSequence = Math.max(state.untitledSequenceByParent[sequenceKey] ?? 1, siblingNextSequence);
  return {
    title: `Excerpt ${nextSequence}`,
    untitledSequenceByParent: {
      ...state.untitledSequenceByParent,
      [sequenceKey]: nextSequence + 1
    }
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
      const titleState = resolveExcerptTitleState(parentNodeId, state);
      node = createExcerptNode({ attachmentId, locator, nodeId, parentNodeId, timestamp, title: titleState.title });
      const next = buildAnnotationCreatePatch({
        createdNode: node,
        parentNodeId,
        state,
        untitledSequenceByParent: titleState.untitledSequenceByParent
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
