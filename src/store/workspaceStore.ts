import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Node } from '../features/nodes/model/nodeTypes';

import { normalizeWidth } from './workspaceHelpers';
import { INITIAL_WORKSPACE_NAVIGATION_STATE, type NodeNavigationResult, type WorkspaceNavigationState } from './workspaceNavigation';
import { createInitialWorkspaceSnapshot } from './workspaceSeed';
import { createWorkspaceNavigationActions } from './workspaceStoreNavigationActions';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';

export interface WorkspaceState {
  activeNodeId: string | null;
  layout: WorkspaceLayoutState;
  navigation: WorkspaceNavigationState;
  nodeViewById: Record<string, NodeViewState | undefined>;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
  goBack: () => NodeNavigationResult | null;
  goForward: () => NodeNavigationResult | null;
  goToParent: () => NodeNavigationResult | null;
  jumpToAncestorNode: (ancestorNodeId: string) => NodeNavigationResult | null;
  openNode: (nodeId: string) => NodeNavigationResult | null;
  resetLayout: () => void;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
  setDocumentMaxWidth: (width: number) => void;
  setListWidth: (width: number) => void;
  setActiveNode: (nodeId: string) => void;
  updateNodeContent: (nodeId: string, content: string) => void;
  updateNodeReveal: (nodeId: string, reveal: string) => void;
  deleteNode: (nodeId: string) => void;
  restoreNode: (nodeId: string) => void;
  deleteNodePermanently: (nodeId: string) => void;
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
  trashedNodeIds: string[];
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
  'activeNodeId' | 'layout' | 'navigation' | 'nodeOrder' | 'nodesById' | 'nodeViewById' | 'trashedNodeIds'
> {
  return {
    ...createInitialWorkspaceSnapshot(now, defaultLayoutState),
    navigation: { ...INITIAL_WORKSPACE_NAVIGATION_STATE }
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
          if (!state.nodesById[nodeId] || state.trashedNodeIds.includes(nodeId)) {
            return state;
          }
          return { activeNodeId: nodeId };
        });
      },
      ...createWorkspaceNavigationActions(set),
      ...createWorkspaceNodeActions(set)
    }),
    {
      name: WORKSPACE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): WorkspacePersistedState => ({
        activeNodeId: state.activeNodeId,
        layout: state.layout,
        nodeViewById: state.nodeViewById,
        nodeOrder: state.nodeOrder,
        nodesById: state.nodesById,
        trashedNodeIds: state.trashedNodeIds
      })
    }
  )
);
