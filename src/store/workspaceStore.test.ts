import { createStore } from 'zustand/vanilla';

import { deriveNodeTitleForCloze, deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import { NODE_TITLE_MAX_CHARS } from '../shared/config/nodeTitleConfig';

import {
  createInitialWorkspaceState,
  DOCUMENT_WIDTH_DEFAULT,
  LIST_WIDTH_DEFAULT,
  type WorkspaceState
} from './workspaceStore';

function createTestStore(now: Date) {
  const initial = createInitialWorkspaceState(now);

  return createStore<WorkspaceState>((set) => ({
    ...initial,
    resetLayout: () => {
      set(() => ({
        layout: {
          documentMaxWidth: DOCUMENT_WIDTH_DEFAULT,
          listWidth: LIST_WIDTH_DEFAULT
        }
      }));
    },
    setNodeViewState: (nodeId, viewState) => {
      set((state) => {
        if (!state.nodesById[nodeId]) {
          return state;
        }
        return {
          nodeViewById: {
            ...state.nodeViewById,
            [nodeId]: viewState
          }
        };
      });
    },
    setDocumentMaxWidth: (width) => {
      if (!Number.isFinite(width) || width <= 0) {
        return;
      }
      set((state) => ({
        layout: {
          ...state.layout,
          documentMaxWidth: Math.round(width)
        }
      }));
    },
    setListWidth: (width) => {
      if (!Number.isFinite(width) || width <= 0) {
        return;
      }
      set((state) => ({
        layout: {
          ...state.layout,
          listWidth: Math.round(width)
        }
      }));
    },
    setActiveNode: (nodeId) => {
      set((state) => {
        if (!state.nodesById[nodeId]) {
          return state;
        }
        return { activeNodeId: nodeId };
      });
    },
    openNode: (nodeId) => {
      let result: { focusAnchor: null; nodeId: string } | null = null;
      set((state) => {
        if (!state.nodesById[nodeId]) {
          return state;
        }
        result = { focusAnchor: null, nodeId };
        return { activeNodeId: nodeId };
      });
      return result;
    },
    goBack: () => null,
    goForward: () => null,
    goToParent: () => null,
    jumpToAncestorNode: () => null,
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
              title: deriveNodeTitleFromContent(content),
              updatedAt: new Date().toISOString()
            }
          }
        };
      });
    },
    updateNodeReveal: (nodeId, reveal) => {
      set((state) => {
        const node = state.nodesById[nodeId];
        if (!node || node.reveal === null) {
          return state;
        }

        return {
          nodesById: {
            ...state.nodesById,
            [nodeId]: {
              ...node,
              reveal,
              updatedAt: new Date().toISOString()
            }
          }
        };
      });
    },
    deleteNode: (nodeId) => {
      set((state) => {
        if (!state.nodesById[nodeId]) {
          return state;
        }

        const nextNodesById = { ...state.nodesById };
        const nextTrashedNodeIds = [...new Set([...state.trashedNodeIds, nodeId])];
        const deletedNode = nextNodesById[nodeId];
        const anchorLink = deletedNode?.anchorLink;
        const parentNodeId = deletedNode?.parentNodeId;
        if (anchorLink && parentNodeId && nextNodesById[parentNodeId] && !nextTrashedNodeIds.includes(parentNodeId)) {
          const parentNode = nextNodesById[parentNodeId];
          const pattern = new RegExp(
            `<${anchorLink.kind}\\s+id="${anchorLink.id}">([\\s\\S]*?)<\\/${anchorLink.kind}\\s+id="${anchorLink.id}">`
          );
          const nextContent = parentNode.content.replace(pattern, '$1');
          nextNodesById[parentNodeId] = {
            ...parentNode,
            content: nextContent,
            title: deriveNodeTitleFromContent(nextContent),
            updatedAt: new Date().toISOString()
          };
        }
        const nextVisibleNodeOrder = state.nodeOrder.filter((id) => !nextTrashedNodeIds.includes(id));
        return {
          activeNodeId: nextVisibleNodeOrder[0] ?? null,
          nodeOrder: state.nodeOrder,
          nodesById: nextNodesById,
          trashedNodeIds: nextTrashedNodeIds
        };
      });
    },
    restoreNode: (nodeId) => {
      set((state) => {
        if (!state.nodesById[nodeId] || !state.trashedNodeIds.includes(nodeId)) {
          return state;
        }
        return {
          trashedNodeIds: state.trashedNodeIds.filter((id) => id !== nodeId)
        };
      });
    },
    deleteNodePermanently: (nodeId) => {
      set((state) => {
        if (!state.nodesById[nodeId]) {
          return state;
        }
        return {
          activeNodeId: state.activeNodeId === nodeId ? null : state.activeNodeId,
          nodeOrder: state.nodeOrder.filter((id) => id !== nodeId),
          nodesById: Object.fromEntries(Object.entries(state.nodesById).filter(([id]) => id !== nodeId)),
          trashedNodeIds: state.trashedNodeIds.filter((id) => id !== nodeId)
        };
      });
    },
    createRootNode: (content = '') => {
      const nodeId = 'node-root-id';
      const timestamp = new Date().toISOString();

      set((state) => ({
        activeNodeId: nodeId,
        nodeOrder: [...state.nodeOrder, nodeId],
        nodesById: {
          ...state.nodesById,
            [nodeId]: {
              id: nodeId,
              parentNodeId: null,
              title: deriveNodeTitleFromContent(content),
              content,
              anchorLink: null,
              reveal: null,
              review: null,
              createdAt: timestamp,
              updatedAt: timestamp
            }
        }
      }));

      return nodeId;
    },
    createHighlightNodeFromSelection: (parentNodeId, content, anchorId) => {
      const normalizedContent = content.trim();
      if (!normalizedContent) {
        return null;
      }

      const childNodeId = 'node-highlight-id';
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
              title: deriveNodeTitleFromContent(normalizedContent),
              content: normalizedContent,
              anchorLink: anchorId ? { id: anchorId, kind: 'highlight' } : null,
              reveal: null,
              review: null,
              createdAt: timestamp,
              updatedAt: timestamp
            }
          }
        };
      });

      return childNodeId;
    },
    createQANodeFromSelection: (parentNodeId, promptContent, answerContent, anchorId) => {
      const normalizedPrompt = promptContent.trim();
      const normalizedAnswer = answerContent.trim();
      if (!normalizedPrompt || !normalizedAnswer) {
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
              title: deriveNodeTitleForCloze(normalizedPrompt, normalizedAnswer),
              content: normalizedPrompt,
              anchorLink: anchorId ? { id: anchorId, kind: 'cloze' } : null,
              reveal: normalizedAnswer,
              review: {
                due: timestamp,
                lastReviewAt: null,
                state: 0,
                stability: 0,
                difficulty: 0,
                elapsedDays: 0,
                scheduledDays: 0,
                reps: 0,
                lapses: 0
              },
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
    expect(initial.layout.listWidth).toBe(LIST_WIDTH_DEFAULT);
    expect(initial.layout.documentMaxWidth).toBe(DOCUMENT_WIDTH_DEFAULT);
  });

  it('updates node content', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));

    store.getState().updateNodeContent('node-1', 'updated markdown');

    const node = store.getState().nodesById['node-1'];
    if (!node) {
      throw new Error('seed node is required in this test');
    }
    expect(node.content).toBe('updated markdown');
    expect(node.title).toBe('updated markdown');
  });

  it('updates reveal content for qa node only', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));
    store.getState().createQANodeFromSelection('node-1', 'Prompt [...]', 'answer');
    store.getState().updateNodeReveal('node-test-id', 'updated answer');
    store.getState().updateNodeReveal('node-1', 'should be ignored');

    expect(store.getState().nodesById['node-test-id']?.reveal).toBe('updated answer');
    expect(store.getState().nodesById['node-1']?.reveal).toBeNull();
  });

  it('derives node title from normalized markdown content', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));
    store.getState().updateNodeContent('node-1', '# New Title\n\nBody paragraph.');

    expect(store.getState().nodesById['node-1']?.title).toBe('New Title Body paragraph.');
  });

  it('keeps full normalized text instead of splitting sentence', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));
    store.getState().updateNodeContent('node-1', 'First clause, second clause. Third sentence.');

    expect(store.getState().nodesById['node-1']?.title).toBe('First clause, second clause. Third sentence.');
  });

  it('does not include anchor tags in derived title', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));
    store.getState().updateNodeContent('node-1', '# Intro <cloze id="1">answer</cloze id="1">');

    expect(store.getState().nodesById['node-1']?.title).toBe('Intro answer');
  });

  it('applies fixed title max length from code config', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));
    const longContent = `# ${'x'.repeat(NODE_TITLE_MAX_CHARS + 20)}`;
    store.getState().updateNodeContent('node-1', longContent);

    expect(store.getState().nodesById['node-1']?.title).toBe('x'.repeat(NODE_TITLE_MAX_CHARS));
  });

  it('uses Untitled when content has no usable text', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));
    store.getState().updateNodeContent('node-1', ' \n\t  ');

    expect(store.getState().nodesById['node-1']?.title).toBe('Untitled');
  });

  it('creates QA node from selected content', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));

    const childNodeId = store.getState().createQANodeFromSelection(
      'node-1',
      'What is [...]?',
      'quoted text'
    );

    expect(childNodeId).toBe('node-test-id');
    expect(store.getState().nodeOrder).toContain('node-test-id');
    expect(store.getState().nodesById['node-test-id']?.parentNodeId).toBe('node-1');
    expect(store.getState().nodesById['node-test-id']?.title).toBe('What is [...]?');
    expect(store.getState().nodesById['node-test-id']?.content).toBe('What is [...]?');
    expect(store.getState().nodesById['node-test-id']?.reveal).toBe('quoted text');
    expect(store.getState().nodesById['node-test-id']?.review).not.toBeNull();
  });

  it('creates highlight node from selected content', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));

    const childNodeId = store.getState().createHighlightNodeFromSelection('node-1', 'selected text');

    expect(childNodeId).toBe('node-highlight-id');
    expect(store.getState().nodeOrder).toContain('node-highlight-id');
    expect(store.getState().nodesById['node-highlight-id']?.parentNodeId).toBe('node-1');
    expect(store.getState().nodesById['node-highlight-id']?.title).toBe('selected text');
    expect(store.getState().nodesById['node-highlight-id']?.content).toBe('selected text');
    expect(store.getState().nodesById['node-highlight-id']?.reveal).toBeNull();
    expect(store.getState().nodesById['node-highlight-id']?.review).toBeNull();
  });

  it('creates root node when workspace is empty', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));
    store.setState({
      activeNodeId: null,
      nodeOrder: [],
      nodesById: {}
    });

    const nodeId = store.getState().createRootNode('Pasted content');

    expect(nodeId).toBe('node-root-id');
    expect(store.getState().activeNodeId).toBe('node-root-id');
    expect(store.getState().nodeOrder).toEqual(['node-root-id']);
    expect(store.getState().nodesById['node-root-id']?.content).toBe('Pasted content');
  });

  it('creates empty root node for explicit new note action', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));
    store.setState({
      activeNodeId: null,
      nodeOrder: [],
      nodesById: {}
    });

    const nodeId = store.getState().createRootNode();

    expect(nodeId).toBe('node-root-id');
    expect(store.getState().nodesById['node-root-id']?.content).toBe('');
    expect(store.getState().nodesById['node-root-id']?.title).toBe('Untitled');
  });

  it('deletes node and switches active node', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));
    store.getState().createHighlightNodeFromSelection('node-1', 'selected text');
    store.getState().setActiveNode('node-highlight-id');

    store.getState().deleteNode('node-highlight-id');

    expect(store.getState().nodesById['node-highlight-id']).toBeDefined();
    expect(store.getState().trashedNodeIds).toContain('node-highlight-id');
    expect(store.getState().activeNodeId).toBe('node-1');
  });

  it('removes matching anchor tags from parent content when deleting linked child node', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));
    const parentContent = 'before <cloze id="1">answer</cloze id="1"> and <highlight id="2">keep</highlight id="2"> after';
    store.getState().updateNodeContent('node-1', parentContent);
    store.getState().createQANodeFromSelection('node-1', 'Prompt [...]', 'answer', '1');

    store.getState().deleteNode('node-test-id');

    expect(store.getState().nodesById['node-1']?.content).toBe(
      'before answer and <highlight id="2">keep</highlight id="2"> after'
    );
    expect(store.getState().nodesById['node-1']?.content).toContain('<highlight id="2">keep</highlight id="2">');
  });

  it('keeps parent content unchanged when deleting child node without anchor link', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));
    const parentContent = 'before <highlight id="1">text</highlight id="1"> after';
    store.getState().updateNodeContent('node-1', parentContent);
    store.getState().createHighlightNodeFromSelection('node-1', 'text');

    store.getState().deleteNode('node-highlight-id');

    expect(store.getState().nodesById['node-1']?.content).toBe(parentContent);
  });

  it('updates layout widths without artificial range clamp and resets to defaults', () => {
    const store = createTestStore(new Date('2026-02-25T00:00:00.000Z'));
    store.getState().setListWidth(1200);
    store.getState().setDocumentMaxWidth(2400);

    expect(store.getState().layout.listWidth).toBe(1200);
    expect(store.getState().layout.documentMaxWidth).toBe(2400);

    store.getState().resetLayout();
    expect(store.getState().layout.listWidth).toBe(LIST_WIDTH_DEFAULT);
    expect(store.getState().layout.documentMaxWidth).toBe(DOCUMENT_WIDTH_DEFAULT);
  });
});
