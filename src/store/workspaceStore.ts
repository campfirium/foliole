import { create } from 'zustand';

import type { Node, NodeReviewProfile } from '../features/nodes/model/nodeTypes';

export interface WorkspaceState {
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  setActiveNode: (nodeId: string) => void;
  updateNodeContent: (nodeId: string, content: string) => void;
  createChildNodeFromSelection: (parentNodeId: string, selectionContent: string) => string | null;
}

export function createDefaultReviewProfile(timestamp: string): NodeReviewProfile {
  return {
    due: timestamp,
    lastReviewAt: null,
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0
  };
}

export function createSeedNode(timestamp: string): Node {
  return {
    id: 'node-1',
    parentNodeId: null,
    title: 'Getting Started',
    content: '# Welcome to Foliole\n\nStart writing markdown here.',
    reveal: null,
    review: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createInitialWorkspaceState(now = new Date()): Pick<
  WorkspaceState,
  'activeNodeId' | 'nodeOrder' | 'nodesById'
> {
  const timestamp = now.toISOString();
  const seedNode = createSeedNode(timestamp);
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
  updateNodeContent: (nodeId, content) => {
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node) {
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
  },
  createChildNodeFromSelection: (parentNodeId, selectionContent) => {
    const normalizedContent = selectionContent.trim();
    if (!normalizedContent) {
      return null;
    }

    const childNodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();

    set((state) => {
      const parentNode = state.nodesById[parentNodeId];
      if (!parentNode) {
        return state;
      }

      return {
        nodeOrder: [...state.nodeOrder, childNodeId],
        nodesById: {
          ...state.nodesById,
          [childNodeId]: {
            id: childNodeId,
            parentNodeId,
            title: `Node ${state.nodeOrder.length + 1}`,
            content: normalizedContent,
            reveal: null,
            review: null,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        }
      };
    });

    return childNodeId;
  }
}));
