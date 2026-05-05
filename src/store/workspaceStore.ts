import { create } from 'zustand';

import type { LearningNode, SourceNode } from '../features/nodes/model/nodeTypes';

export interface WorkspaceState {
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, LearningNode>;
  setActiveNode: (nodeId: string) => void;
  updateSourceContent: (nodeId: string, content: string) => void;
}

export function createSeedSourceNode(timestamp: string): SourceNode {
  return {
    id: 'source-1',
    kind: 'source',
    title: 'Getting Started',
    content: '# Welcome to Foliole\n\nStart writing markdown here.',
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createInitialWorkspaceState(now = new Date()): Pick<
  WorkspaceState,
  'activeNodeId' | 'nodeOrder' | 'nodesById'
> {
  const timestamp = now.toISOString();
  const seedNode = createSeedSourceNode(timestamp);
  return {
    activeNodeId: seedNode.id,
    nodeOrder: [seedNode.id],
    nodesById: { [seedNode.id]: seedNode }
  };
}

const initialState = createInitialWorkspaceState();

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  ...initialState,
  setActiveNode: (nodeId) => {
    set((state) => {
      if (!state.nodesById[nodeId]) {
        return state;
      }
      return { activeNodeId: nodeId };
    });
  },
  updateSourceContent: (nodeId, content) => {
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node || node.kind !== 'source') {
        return state;
      }

      return {
        nodesById: {
          ...state.nodesById,
          [nodeId]: {
            ...node,
            content,
            updatedAt: new Date().toISOString()
          }
        }
      };
    });
  }
}));
