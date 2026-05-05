import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { parseAnchorBlocks } from '../features/editor/model/anchorBlocks';
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
  updateNodeReveal: (nodeId: string, reveal: string) => void;
  deleteNode: (nodeId: string) => void;
  createRootNode: (content?: string) => string;
  createHighlightNodeFromSelection: (parentNodeId: string, content: string, anchorId?: string) => string | null;
  createQANodeFromSelection: (
    parentNodeId: string,
    promptContent: string,
    answerContent: string,
    anchorId?: string
  ) => string | null;
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

function removeAnchorTagsForLink(content: string, anchor: { id: string; kind: 'highlight' | 'cloze' }) {
  const matchedBlock = parseAnchorBlocks(content).blocks.find((block) => block.id === anchor.id && block.kind === anchor.kind);
  if (!matchedBlock) {
    return content;
  }

  const before = content.slice(0, matchedBlock.openTagFrom);
  const inner = content.slice(matchedBlock.openTagTo, matchedBlock.closeTagFrom);
  const after = content.slice(matchedBlock.closeTagTo);
  return `${before}${inner}${after}`;
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

          const deletedParentId = state.nodesById[nodeId]?.parentNodeId ?? null;
          const idsToDelete = collectNodeSubtreeIds(nodeId, state.nodesById);
          const idsToDeleteSet = new Set(idsToDelete);
          const remainingNodeOrder = state.nodeOrder.filter((id) => !idsToDeleteSet.has(id));
          const remainingNodesById = Object.fromEntries(
            Object.entries(state.nodesById).filter(([id]) => !idsToDeleteSet.has(id))
          );

          for (const deletedId of idsToDelete) {
            const deletedNode = state.nodesById[deletedId];
            const anchorLink = deletedNode?.anchorLink;
            const parentNodeId = deletedNode?.parentNodeId;
            if (!anchorLink || !parentNodeId || idsToDeleteSet.has(parentNodeId)) {
              continue;
            }

            const parentNode = remainingNodesById[parentNodeId];
            if (!parentNode) {
              continue;
            }

            const cleanedContent = removeAnchorTagsForLink(parentNode.content, anchorLink);
            if (cleanedContent === parentNode.content) {
              continue;
            }

            remainingNodesById[parentNodeId] = {
              ...parentNode,
              content: cleanedContent,
              title: deriveNodeTitleFromContent(cleanedContent),
              updatedAt: new Date().toISOString()
            };
          }

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
      createRootNode: (content = '') => {
        const nodeId = `node-${crypto.randomUUID()}`;
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
                anchorLink: anchorId ? { id: anchorId, kind: 'cloze' } : null,
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
