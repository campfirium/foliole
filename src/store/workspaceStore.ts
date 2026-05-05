import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Node, NodeReviewProfile } from '../features/nodes/model/nodeTypes';

export interface WorkspaceState {
  activeNodeId: string | null;
  layout: WorkspaceLayoutState;
  nodeViewById: Record<string, NodeViewState | undefined>;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  resetLayout: () => void;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
  setDocumentMaxWidth: (width: number) => void;
  setListWidth: (width: number) => void;
  setActiveNode: (nodeId: string) => void;
  updateNodeContent: (nodeId: string, content: string) => void;
  createQANodeFromSelection: (parentNodeId: string, promptContent: string, answerContent: string) => string | null;
}

interface WorkspacePersistedState {
  activeNodeId: string | null;
  layout: WorkspaceLayoutState;
  nodeViewById: Record<string, NodeViewState | undefined>;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
}

export interface WorkspaceLayoutState {
  documentMaxWidth: number;
  listWidth: number;
}

export interface NodeViewState {
  scrollTop: number;
  selection: {
    from: number;
    to: number;
  };
}

export const WORKSPACE_STORAGE_KEY = 'foliole-workspace-v1';
export const LIST_WIDTH_DEFAULT = 300;
export const DOCUMENT_WIDTH_DEFAULT = 860;

const defaultLayoutState: WorkspaceLayoutState = {
  documentMaxWidth: DOCUMENT_WIDTH_DEFAULT,
  listWidth: LIST_WIDTH_DEFAULT
};

function normalizeWidth(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
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
  'activeNodeId' | 'layout' | 'nodeOrder' | 'nodesById' | 'nodeViewById'
> {
  const timestamp = now.toISOString();
  const seedNode = createSeedNode(timestamp);
  return {
    activeNodeId: seedNode.id,
    layout: { ...defaultLayoutState },
    nodeViewById: {},
    nodeOrder: [seedNode.id],
    nodesById: { [seedNode.id]: seedNode }
  };
}

const initialState = createInitialWorkspaceState();

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      ...initialState,
      resetLayout: () => {
        set({ layout: { ...defaultLayoutState } });
      },
      setNodeViewState: (nodeId, viewState) => {
        set((state) => {
          if (!state.nodesById[nodeId]) {
            return state;
          }

          return {
            nodeViewById: {
              ...state.nodeViewById,
              [nodeId]: {
                scrollTop: Math.max(0, viewState.scrollTop),
                selection: {
                  from: Math.max(0, viewState.selection.from),
                  to: Math.max(0, viewState.selection.to)
                }
              }
            }
          };
        });
      },
      setDocumentMaxWidth: (width) => {
        const normalizedWidth = normalizeWidth(width);
        if (!normalizedWidth) {
          return;
        }
        set((state) => ({
          layout: {
            ...state.layout,
            documentMaxWidth: normalizedWidth
          }
        }));
      },
      setListWidth: (width) => {
        const normalizedWidth = normalizeWidth(width);
        if (!normalizedWidth) {
          return;
        }
        set((state) => ({
          layout: {
            ...state.layout,
            listWidth: normalizedWidth
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
      createQANodeFromSelection: (parentNodeId, promptContent, answerContent) => {
        const normalizedPrompt = promptContent.trim();
        const normalizedAnswer = answerContent.trim();
        if (!normalizedPrompt || !normalizedAnswer) {
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
                title: `QA ${state.nodeOrder.length + 1}`,
                content: normalizedPrompt,
                reveal: normalizedAnswer,
                review: createDefaultReviewProfile(timestamp),
                createdAt: timestamp,
                updatedAt: timestamp
              }
            }
          };
        });

        return childNodeId;
      }
    }),
    {
      name: WORKSPACE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): WorkspacePersistedState => ({
        activeNodeId: state.activeNodeId,
        layout: state.layout,
        nodeViewById: state.nodeViewById,
        nodeOrder: state.nodeOrder,
        nodesById: state.nodesById
      })
    }
  )
);
