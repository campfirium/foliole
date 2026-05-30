import type { Node } from '../../features/nodes/model/nodeTypes';
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
        hasContent: node.content.trim().length > 0,
        hasReveal: node.reveal != null,
        id: node.id,
        imageRegions: node.imageRegions ?? null,
        kind: node.kind ?? initialNode.kind,
        parentNodeId: node.parentNodeId ?? null,
        reveal: node.reveal ?? null,
        title: node.title,
        updatedAt: `2026-04-08T00:00:${String(index).padStart(2, '0')}.000Z`
      }
    ])
  );
}

export function createSeedNodeDebugApi(): SeedNodeDebugApi {
  return {
    seedNodes: async (nodes, options) => {
      const initial = createInitialWorkspaceState(new Date('2026-04-08T00:00:00.000Z'));
      const seededNodesById = buildSeededNodes(
        nodes,
        '2026-04-08T00:00:00.000Z',
        initial.nodesById['node-1'] ?? Object.values(initial.nodesById)[0]!
      );
      useWorkspaceStore.setState({
        ...initial,
        activeNodeId: nodes[0]?.id ?? null,
        isHydrated: true,
        nodeOrder: nodes.map((node) => node.id),
        nodesById: seededNodesById,
        trashedNodeIds: []
      });
      if (options?.persist !== false) {
        await persistSeedNodes(nodes);
      }
    }
  };
}
