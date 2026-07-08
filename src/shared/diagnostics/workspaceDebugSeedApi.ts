import type { Node } from '../../features/nodes/model/nodeTypes';
import { toWorkspaceNodeDocument, writeCachedWorkspaceNodeDocument } from '../../store/workspaceNodeDocumentCache';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { type DebugNodeSeed, persistSeedNodes } from './workspaceDebugSeedPersistence';

export type SeedNodeDebugApi = {
  seedNodes: (nodes: DebugNodeSeed[], options?: { persist?: boolean }) => Promise<void>;
};

function buildSeededNodes(nodes: DebugNodeSeed[], createdAt: string, initialNode: Node): Record<string, Node> {
  const baseNode = { ...initialNode };
  delete baseNode.specialKind;
  delete baseNode.virtualFilter;
  return Object.fromEntries(
    nodes.map((node, index) => [
      node.id,
      {
        ...baseNode,
        anchorLink: node.anchorLink ?? null,
        bodyStatus: node.content.trim().length > 0 ? 'ready' : 'empty',
        content: node.content,
        createdAt,
        desiredRetention: node.desiredRetention ?? baseNode.desiredRetention ?? null,
        hasContent: node.content.trim().length > 0,
        hasReveal: node.reveal != null,
        id: node.id,
        imageRegions: node.imageRegions ?? null,
        kind: node.kind ?? initialNode.kind,
        parentNodeId: node.parentNodeId ?? null,
        priority: node.priority ?? baseNode.priority ?? null,
        reading: node.reading ?? null,
        reveal: node.reveal ?? null,
        review: node.review ?? null,
        title: node.title,
        updatedAt: `2026-04-08T00:00:${String(index).padStart(2, '0')}.000Z`
      }
    ])
  );
}

function cacheSeededNodeDocuments(nodesById: Record<string, Node>) {
  for (const node of Object.values(nodesById)) {
    writeCachedWorkspaceNodeDocument(node.id, toWorkspaceNodeDocument(node));
  }
}

export function createSeedNodeDebugApi(canPersistSeeds: () => boolean = () => false): SeedNodeDebugApi {
  return {
    seedNodes: async (nodes, options) => {
      const initial = createInitialWorkspaceState(new Date('2026-04-08T00:00:00.000Z'));
      const seededNodesById = buildSeededNodes(
        nodes,
        '2026-04-08T00:00:00.000Z',
        initial.nodesById['node-1'] ?? Object.values(initial.nodesById)[0]!
      );
      cacheSeededNodeDocuments(seededNodesById);
      useWorkspaceStore.setState({
        ...initial,
        activeNodeId: nodes[0]?.id ?? null,
        isHydrated: true,
        nodeOrder: [...initial.nodeOrder, ...nodes.map((node) => node.id)],
        nodesById: {
          ...initial.nodesById,
          ...seededNodesById
        },
        rendererBoundaryKeepNodeIds: nodes.map((node) => node.id),
        trashedNodeIds: []
      });
      if (options?.persist !== false && canPersistSeeds()) {
        await persistSeedNodes(nodes);
      }
    }
  };
}
