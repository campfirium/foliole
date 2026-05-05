import type { NodeAnchorLink, NodeImageRegionGroup } from '../../features/nodes/model/nodeTypes';
import {
  saveCreatedWorkspaceNodeSnapshot,
  saveWorkspaceNodeOrder
} from '../platform/workspaceRuntimeRepository';
import type {
  WorkspaceRuntimeNode,
  WorkspaceRuntimeNodeDocument
} from '../platform/workspaceRuntimeTypes';

export interface DebugNodeSeed {
  anchorLink?: NodeAnchorLink | null;
  content: string;
  id: string;
  imageRegions?: NodeImageRegionGroup[] | null;
  kind?: 'folder' | 'item' | 'topic';
  parentNodeId?: string | null;
  reveal?: string | null;
  title: string;
}

function createSeedRuntimeNode(node: DebugNodeSeed, index: number): WorkspaceRuntimeNode {
  return {
    anchorLink: node.anchorLink ?? null,
    content: node.content,
    createdAt: '2026-04-08T00:00:00.000Z',
    desiredRetention: null,
    hideTitleHeading: false,
    id: node.id,
    imageRegions: node.imageRegions ?? null,
    isTitleManual: true,
    kind: node.kind ?? 'topic',
    parentNodeId: node.parentNodeId ?? null,
    priority: null,
    reading: null,
    reveal: node.reveal ?? null,
    title: node.title,
    updatedAt: `2026-04-08T00:00:${String(index).padStart(2, '0')}.000Z`,
    virtualFilter: null
  };
}

export async function persistSeedNodes(nodes: DebugNodeSeed[]) {
  nodes.forEach((node, index) => {
    saveCreatedWorkspaceNodeSnapshot({
      isDocumentLoaded: () => true,
      mergeDocument: (runtimeNode: WorkspaceRuntimeNode, document: WorkspaceRuntimeNodeDocument) => ({
        ...runtimeNode,
        ...document
      }),
      node: createSeedRuntimeNode(node, index),
      position: index
    });
  });
  saveWorkspaceNodeOrder(nodes.map((node) => node.id));
}
