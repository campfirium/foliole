import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { deriveNodeTitleForCloze, deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import type { Node } from '../features/nodes/model/nodeTypes';

import { collectNodeSubtreeIds, findFallbackActiveNodeId, normalizeWidth } from './workspaceHelpers';
import { createDefaultReviewProfile, createInitialWorkspaceSnapshot } from './workspaceSeed';

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
  deleteNode: (nodeId: string) => void;
  createHighlightNodeFromSelection: (parentNodeId: string, content: string) => string | null;
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

export function createInitialWorkspaceState(now = new Date()): Pick<
  WorkspaceState,
  'activeNodeId' | 'layout' | 'nodeOrder' | 'nodesById' | 'nodeViewById'
> {
  return createInitialWorkspaceSnapshot(now, defaultLayoutState);
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
          const nextTitle = deriveNodeTitleFromContent(content);

          return {
            nodesById: {
              ...state.nodesById,
              [nodeId]: {
                ...node,
                content,
                title: nextTitle,
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

          const deletedParentId = state.nodesById[nodeId]?.parentNodeId ?? null;
          const idsToDelete = collectNodeSubtreeIds(nodeId, state.nodesById);
          const idsToDeleteSet = new Set(idsToDelete);
          const remainingNodeOrder = state.nodeOrder.filter((id) => !idsToDeleteSet.has(id));
          const remainingNodesById = Object.fromEntries(
            Object.entries(state.nodesById).filter(([id]) => !idsToDeleteSet.has(id))
          );
          const nextActiveNodeId =
            state.activeNodeId && !idsToDeleteSet.has(state.activeNodeId)
              ? state.activeNodeId
              : findFallbackActiveNodeId(deletedParentId, remainingNodeOrder, remainingNodesById);

          return {
            activeNodeId: nextActiveNodeId,
            nodeOrder: remainingNodeOrder,
            nodesById: remainingNodesById
          };
        });
      },
      createHighlightNodeFromSelection: (parentNodeId, content) => {
        const normalizedContent = content.trim();
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
                title: deriveNodeTitleFromContent(normalizedContent),
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
                title: deriveNodeTitleForCloze(normalizedPrompt, normalizedAnswer),
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
