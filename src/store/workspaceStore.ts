import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import type { Node } from '../features/nodes/model/nodeTypes';
import { ensureInboxNodeInSnapshot } from '../features/nodes/model/specialNodes';
import type { ReviewGrade } from '../features/review/model/reviewTypes';

import { loadListCollapsedPreference, loadRightSidebarCollapsedPreference } from './workspaceLayoutPrefs';
import { INITIAL_WORKSPACE_NAVIGATION_STATE, type NodeNavigationResult, type WorkspaceNavigationState } from './workspaceNavigation';
import { listPendingNodeSyncNodeIds } from './workspacePendingNodeSync';
import { workspacePersistStorage } from './workspacePersistStorage';
import { enforceWorkspaceRendererBoundary, trimWorkspaceNodesForRendererBoundary } from './workspaceRendererBoundary';
import { registerPendingNodeSyncRendererBoundary } from './workspaceRendererBoundaryPendingSync';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import { createInitialWorkspaceSnapshot } from './workspaceSeed';
import { createWorkspaceLayoutActions } from './workspaceStoreLayoutActions';
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
  untitledSequenceByParent: Record<string, number>;
  goBack: () => NodeNavigationResult | null;
  goForward: () => NodeNavigationResult | null;
  goToParent: () => NodeNavigationResult | null;
  jumpToAncestorNode: (ancestorNodeId: string) => NodeNavigationResult | null;
  openNode: (nodeId: string) => NodeNavigationResult | null;
  resetLayout: () => void;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
  setDocumentMaxWidth: (width: number) => void;
  setListWidth: (width: number) => void;
  setListCollapsed: (collapsed: boolean) => void;
  setRightSidebarWidth: (width: number) => void;
  setRightSidebarCollapsed: (collapsed: boolean) => void;
  setActiveNode: (nodeId: string) => void;
  updateNodeTitle: (nodeId: string, title: string) => void;
  updateNodeContent: (nodeId: string, content: string) => void;
  updateNodeReveal: (nodeId: string, reveal: string) => void;
  updateNodePriority: (nodeId: string, priority: number | null) => void;
  updateNodeDesiredRetention: (nodeId: string, desiredRetention: number | null) => void;
  dismissNode: (nodeId: string, now?: string) => boolean;
  relearnNode: (nodeId: string, now?: string) => boolean;
  startReviewSession: (now?: string) => boolean;
  revealReviewAnswer: () => void;
  gradeReviewCard: (grade: ReviewGrade, now?: string) => Promise<boolean>;
  completeReviewItem: (now?: string) => boolean;
  deferReviewItem: () => boolean;
  dismissReviewItem: (now?: string) => boolean;
  exitReviewSession: () => void;
  deleteNode: (nodeId: string) => void;
  deleteNodes: (nodeIds: string[]) => void;
  restoreNode: (nodeId: string) => void;
  deleteNodePermanently: (nodeId: string) => void;
  deleteNodesPermanently: (nodeIds: string[]) => void;
  createRootNode: (content?: string, kind?: NodeKind) => string;
  createChildNode: (parentNodeId: string, content?: string, kind?: NodeKind) => string;
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
  untitledSequenceByParent: Record<string, number>;
}

export interface WorkspaceLayoutState {
  documentMaxWidth: number;
  isListCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  listWidth: number;
  rightSidebarWidth: number;
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
export const RIGHT_SIDEBAR_WIDTH_DEFAULT = 320;

const defaultLayoutState: WorkspaceLayoutState = {
  documentMaxWidth: DOCUMENT_WIDTH_DEFAULT,
  isListCollapsed: false,
  isRightSidebarCollapsed: false,
  listWidth: LIST_WIDTH_DEFAULT,
  rightSidebarWidth: RIGHT_SIDEBAR_WIDTH_DEFAULT
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
  | 'untitledSequenceByParent'
> {
  return {
    ...createInitialWorkspaceSnapshot(now, {
      ...defaultLayoutState,
      isListCollapsed: loadListCollapsedPreference(),
      isRightSidebarCollapsed: loadRightSidebarCollapsedPreference()
    }),
    navigation: { ...INITIAL_WORKSPACE_NAVIGATION_STATE },
    reviewSession: {
      currentNodeId: null,
      isAnswerRevealed: false,
      queueNodeIds: [],
      totalNodeCount: 0
    },
    untitledSequenceByParent: {}
  };
}

const initialState = createInitialWorkspaceState();

function withRendererBoundary(state: WorkspaceState | Partial<WorkspaceState>, currentState: WorkspaceState) {
  return enforceWorkspaceRendererBoundary(state, currentState, new Set(listPendingNodeSyncNodeIds()));
}

const workspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => {
      const boundaryAwareSet: typeof set = (partial) => {
        set((currentState) => {
          const nextState = typeof partial === 'function' ? partial(currentState) : partial;
          if (nextState === currentState) {
            return currentState;
          }
          return withRendererBoundary(nextState, currentState);
        });
      };

      return ({
      ...initialState,
      ...createWorkspaceLayoutActions(boundaryAwareSet, defaultLayoutState),
      setActiveNode: (nodeId) => {
        boundaryAwareSet((state) => {
          if (!state.nodesById[nodeId] || state.trashedNodeIds.includes(nodeId)) {
            return state;
          }
          return {
            activeNodeId: nodeId,
            reviewSession: reconcileReviewSession(state, nodeId)
          };
        });
      },
      ...createWorkspaceNavigationActions(boundaryAwareSet),
      ...createWorkspaceNodeActions(boundaryAwareSet),
      ...createWorkspaceReviewActions(boundaryAwareSet, get)
    });
    },
    {
      name: WORKSPACE_STORAGE_KEY,
      storage: createJSONStorage(() => workspacePersistStorage),
      partialize: (state): WorkspacePersistedState => ({
        activeNodeId: state.activeNodeId,
        layout: state.layout,
        nodeViewById: state.nodeViewById,
        nodeOrder: state.nodeOrder,
        nodesById: trimWorkspaceNodesForRendererBoundary(
          state.activeNodeId,
          state.nodesById,
          new Set(listPendingNodeSyncNodeIds())
        ),
        trashedNodeIds: state.trashedNodeIds,
        untitledSequenceByParent: state.untitledSequenceByParent
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<WorkspacePersistedState>;
        const nextState = {
          ...currentState,
          ...persisted,
          layout: {
            ...currentState.layout,
            ...persisted.layout
          },
          nodeViewById: persisted.nodeViewById ?? currentState.nodeViewById,
          untitledSequenceByParent:
            persisted.untitledSequenceByParent ?? currentState.untitledSequenceByParent
        };
        return withRendererBoundary({
          ...nextState,
          ...ensureInboxNodeInSnapshot({
            activeNodeId: nextState.activeNodeId,
            nodeOrder: nextState.nodeOrder,
            nodesById: nextState.nodesById,
            trashedNodeIds: nextState.trashedNodeIds
          })
        }, currentState) as WorkspaceState;
      }
    }
  )
);

const rawWorkspaceSetState = workspaceStore.setState.bind(workspaceStore);

workspaceStore.setState = ((partial, replace) =>
  {
    const nextPartial = (currentState: WorkspaceState) => {
      const nextState = typeof partial === 'function' ? partial(currentState) : partial;
      if (nextState === currentState) {
        return currentState;
      }
      return withRendererBoundary(
        'activeNodeId' in nextState || !('nodesById' in nextState)
          ? nextState
          : { ...nextState, activeNodeId: currentState.activeNodeId },
        currentState
      ) as WorkspaceState;
    };

    if (replace) {
      return rawWorkspaceSetState(nextPartial as (state: WorkspaceState) => WorkspaceState, true);
    }

    return rawWorkspaceSetState(nextPartial, false);
  }) as typeof workspaceStore.setState;

registerPendingNodeSyncRendererBoundary(workspaceStore);

export const useWorkspaceStore = workspaceStore;
