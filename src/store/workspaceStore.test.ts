import { createStore } from 'zustand/vanilla';

import { createInitialWorkspaceState, type WorkspaceState } from './workspaceStore';

function createTestStore(now: Date) {
  const initial = createInitialWorkspaceState(now);

  return createStore<WorkspaceState>((set) => ({
    ...initial,
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

      const childNodeId = 'node-test-id';
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
              title: 'Node 2',
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
}

describe('workspaceStore', () => {
  it('creates seed node as initial state', () => {
    const initial = createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z'));

    expect(initial.activeNodeId).toBe('node-1');
    expect(initial.nodeOrder).toEqual(['node-1']);
    expect(initial.nodesById['node-1']?.parentNodeId).toBeNull();
    expect(initial.nodesById['node-1']?.review).toBeNull();
  });

  it('updates node content', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));

    store.getState().updateNodeContent('node-1', 'updated markdown');

    const node = store.getState().nodesById['node-1'];
    if (!node) {
      throw new Error('seed node is required in this test');
    }
    expect(node.content).toBe('updated markdown');
  });

  it('creates child node from selected content', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));

    const childNodeId = store.getState().createChildNodeFromSelection('node-1', 'quoted text');

    expect(childNodeId).toBe('node-test-id');
    expect(store.getState().nodeOrder).toContain('node-test-id');
    expect(store.getState().nodesById['node-test-id']?.parentNodeId).toBe('node-1');
    expect(store.getState().nodesById['node-test-id']?.content).toBe('quoted text');
  });
});
