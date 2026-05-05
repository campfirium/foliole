import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Node } from '../features/nodes/model/nodeTypes';
import type { ReviewGrade } from '../features/review/model/reviewTypes';

import { normalizeWidth } from './workspaceHelpers';
import { INITIAL_WORKSPACE_NAVIGATION_STATE, type NodeNavigationResult, type WorkspaceNavigationState } from './workspaceNavigation';
import { workspacePersistStorage } from './workspacePersistStorage';
import { createInitialWorkspaceSnapshot } from './workspaceSeed';
import { createWorkspaceNavigationActions } from './workspaceStoreNavigationActions';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';

export interface WorkspaceState {
  activeNodeId: string | null;
  layout: WorkspaceLayoutState;
  navigation: WorkspaceNavigationState;
  nodeViewById: Record<string, NodeViewState | undefined>;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  reviewSession: ReviewSessionState;
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
  updateNodeTitle: (nodeId: string, title: string) => void;
  updateNodeContent: (nodeId: string, content: string) => void;
  updateNodeReveal: (nodeId: string, reveal: string) => void;
  updateNodePriority: (nodeId: string, priority: number | null) => void;
  updateNodeDesiredRetention: (nodeId: string, desiredRetention: number | null) => void;
  startReviewSession: (now?: string) => boolean;
  revealReviewAnswer: () => void;
  gradeReviewCard: (grade: ReviewGrade, now?: string) => Promise<boolean>;
  exitReviewSession: () => void;
  deleteNode: (nodeId: string) => void;
  restoreNode: (nodeId: string) => void;
  deleteNodePermanently: (nodeId: string) => void;
  createRootNode: (content?: string) => string;
  createChildNode: (parentNodeId: string, content?: string) => string;
  createHighlightNodeFromSelection: (parentNodeId: string, content: string, anchorId?: string) => string | null;
  createQANodeFromSelection: (
    parentNodeId: string,
    promptContent: string,
    answerContent: string,
    anchorId?: string
  ) => string | null;
  moveNode: (nodeId: string, nextParentNodeId: string | null) => boolean;
  moveNodes: (
    nodeIds: string[],
    targetNodeId: string | null,
    intent: 'before' | 'after' | 'child' | 'root'
  ) => boolean;
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

export interface ReviewSessionState {
  currentNodeId: string | null;
  isAnswerRevealed: boolean;
  queueNodeIds: string[];
  totalNodeCount: number;
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
  | 'activeNodeId'
  | 'layout'
  | 'navigation'
  | 'nodeOrder'
  | 'nodesById'
  | 'nodeViewById'
  | 'reviewSession'
  | 'trashedNodeIds'
> {
  return {
    ...createInitialWorkspaceSnapshot(now, defaultLayoutState),
    navigation: { ...INITIAL_WORKSPACE_NAVIGATION_STATE },
    reviewSession: {
      currentNodeId: null,
      isAnswerRevealed: false,
      queueNodeIds: [],
      totalNodeCount: 0
    }
  };
}

const initialState = createInitialWorkspaceState();

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
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
      ...createWorkspaceNodeActions(set),
      ...createWorkspaceReviewActions(set, get)
    }),
    {
      name: WORKSPACE_STORAGE_KEY,
      storage: createJSONStorage(() => workspacePersistStorage),
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
