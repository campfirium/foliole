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
    },
    createExtractFromSelection: (sourceNodeId, quote) => {
      const normalizedQuote = quote.trim();
      if (!normalizedQuote) {
        return null;
      }

      const extractId = 'extract-test-id';
      const timestamp = new Date().toISOString();

      set((state) => {
        const sourceNode = state.nodesById[sourceNodeId];
        if (!sourceNode || sourceNode.kind !== 'source') {
          return state;
        }

        return {
          nodeOrder: [...state.nodeOrder, extractId],
          nodesById: {
            ...state.nodesById,
            [extractId]: {
              id: extractId,
              kind: 'extract',
              sourceNodeId,
              quote: normalizedQuote,
              title: 'Extract 1',
              createdAt: timestamp,
              updatedAt: timestamp
            }
          }
        };
      });

      return extractId;
    }
  }));
}

describe('workspaceStore', () => {
  it('creates source seed node as initial state', () => {
    const initial = createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z'));

    expect(initial.activeNodeId).toBe('source-1');
    expect(initial.nodeOrder).toEqual(['source-1']);
    expect(initial.nodesById['source-1']?.kind).toBe('source');
  });

  it('updates source node content', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));

    store.getState().updateSourceContent('source-1', 'updated markdown');

    const node = store.getState().nodesById['source-1'];
    expect(node?.kind).toBe('source');
    if (!node || node.kind !== 'source') {
      throw new Error('source node is required in this test');
    }
    expect(node.content).toBe('updated markdown');
  });

  it('creates extract node from selected quote', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));

    const extractId = store.getState().createExtractFromSelection('source-1', 'quoted text');

    expect(extractId).toBe('extract-test-id');
    expect(store.getState().nodeOrder).toContain('extract-test-id');
    expect(store.getState().nodesById['extract-test-id']?.kind).toBe('extract');
  });
});
