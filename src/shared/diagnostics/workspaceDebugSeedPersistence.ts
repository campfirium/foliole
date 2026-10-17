import type {
  NodeAnchorLink,
  NodeImageRegionGroup,
  NodeReadingProfile,
  NodeReviewProfile
} from '../../features/nodes/model/nodeTypes';
import { syncWorkspaceNodeDocumentCacheFromNode } from '../../store/workspaceNodeDocumentCache';
import { createWorkspaceNodeCreateAckPatch } from '../../store/workspaceNodeMutationPatch';
import { useWorkspaceStore } from '../../store/workspaceStore';
import {
  saveCreatedWorkspaceNodeMutationSnapshot,
  saveWorkspaceNodeOrder
} from '../platform/workspaceRuntimeRepository';
import type {
  WorkspaceRuntimeNode
} from '../platform/workspaceRuntimeTypes';

export interface DebugNodeSeed {
  anchorLink?: NodeAnchorLink | null;
  content: string;
  desiredRetention?: number | null;
  id: string;
  imageRegions?: NodeImageRegionGroup[] | null;
  kind?: 'folder' | 'item' | 'topic';
  parentNodeId?: string | null;
  priority?: number | null;
  reading?: NodeReadingProfile | null;
  reveal?: string | null;
  review?: NodeReviewProfile | null;
  shelvedAt?: string | null;
  title: string;
}

function createSeedRuntimeNode(node: DebugNodeSeed, index: number): WorkspaceRuntimeNode {
  return {
    anchorLink: node.anchorLink ?? null,
    content: node.content,
    createdAt: '2026-04-08T00:00:00.000Z',
    desiredRetention: node.desiredRetention ?? null,
    hideTitleHeading: false,
    id: node.id,
    imageRegions: node.imageRegions ?? null,
    isTitleManual: true,
    kind: node.kind ?? 'topic',
    parentNodeId: node.parentNodeId ?? null,
    priority: node.priority ?? null,
    reading: node.reading ?? null,
    review: node.review ?? null,
    reveal: node.reveal ?? null,
    shelvedAt: node.shelvedAt ?? null,
    title: node.title,
    updatedAt: `2026-04-08T00:00:${String(index).padStart(2, '0')}.000Z`,
    virtualFilter: null
  };
}

export async function persistSeedNodes(nodes: DebugNodeSeed[]) {
  const nodeOrder = nodes.map((node) => node.id);
  for (const [index, node] of nodes.entries()) {
    const result = await saveCreatedWorkspaceNodeMutationSnapshot({
      activeNodeId: nodes[0]?.id ?? null,
      node: createSeedRuntimeNode(node, index),
      nodeOrder,
      position: index
    });
    if (result) {
      useWorkspaceStore.setState(state => createWorkspaceNodeCreateAckPatch(state, result, [node.id]));
      syncWorkspaceNodeDocumentCacheFromNode(useWorkspaceStore.getState().nodesById[node.id]);
    }
  }
  saveWorkspaceNodeOrder(nodeOrder);
}
