import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createEmptyEditorOperationHistory } from '../features/editor/model/editorOperationHistory';
import { DEFAULT_REVIEW_SESSION_MODE } from '../features/review/model/reviewSessionMode';

import { createEmptyWorkspaceActionHistory, createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { isCanonicalVisibleNodeId } from './workspaceCanonicalSelectors';
import { createWorkspaceEditorOperationHistoryActions } from './workspaceEditorOperationHistory';
import { loadWorkspaceLayoutPreferenceSnapshot } from './workspaceLayoutPrefs';
import { INITIAL_WORKSPACE_NAVIGATION_STATE } from './workspaceNavigation';
import { registerPendingNodeSyncRendererBoundary } from './workspaceRendererBoundaryPendingSync';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import { createEmptyWorkspaceSnapshot } from './workspaceSeed';
import { createWorkspaceLayoutActions } from './workspaceStoreLayoutActions';
import { createWorkspaceNavigationActions } from './workspaceStoreNavigationActions';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import { markNodeOpenedViewState } from './workspaceStoreOpenedNodeView';
import { createWorkspaceStorePersistConfig } from './workspaceStorePersistConfig';
import { withWorkspaceRendererBoundary } from './workspaceStoreRendererBoundary';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import type { WorkspaceLayoutState, WorkspaceState } from './workspaceStoreTypes';

export type {
  NodeViewState,
  ReviewSessionState,
  WorkspaceLayoutState,
  WorkspacePersistedState,
  WorkspaceState
} from './workspaceStoreTypes';

export const WORKSPACE_STORAGE_KEY = 'foliole-workspace-v1';
export const LIST_WIDTH_DEFAULT = 450;
export const DOCUMENT_WIDTH_DEFAULT = 860;
export const RIGHT_SIDEBAR_WIDTH_DEFAULT = 250;

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
  | 'appActionHistory'
  | 'capturedWorkspaceVersion'
  | 'editorOperationHistory'
  | 'isHydrated'
  | 'workspaceHydrationError'
  | 'layout'
  | 'navigation'
  | 'nodeOrder'
  | 'nodesById'
  | 'rendererBoundaryKeepNodeIds'
  | 'nodeViewById'
  | 'reviewSession'
  | 'reviewSessionMode'
  | 'trashedNodeDeletedAtById'
  | 'trashedNodeIds'
  | 'untitledSequenceByParent'
> {
  return {
    ...createEmptyWorkspaceSnapshot(now, loadWorkspaceLayoutPreferenceSnapshot(defaultLayoutState)),
    appActionHistory: createEmptyWorkspaceActionHistory(),
    capturedWorkspaceVersion: null,
    editorOperationHistory: createEmptyEditorOperationHistory(),
    isHydrated: false,
    workspaceHydrationError: null,
    navigation: { ...INITIAL_WORKSPACE_NAVIGATION_STATE },
    rendererBoundaryKeepNodeIds: [],
    reviewSession: {
      currentNodeId: null,
      isAnswerRevealed: false,
      queueNodeIds: [],
      totalNodeCount: 0
    },
    reviewSessionMode: DEFAULT_REVIEW_SESSION_MODE,
    trashedNodeDeletedAtById: {},
    untitledSequenceByParent: {}
  };
}

const initialState = createInitialWorkspaceState();
let updateWorkspaceHydrationState: () => void = () => undefined;
let updateWorkspaceHydrationError: (error: unknown) => void = () => undefined;

const workspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => {
      updateWorkspaceHydrationState = () => {
        set({ isHydrated: true, workspaceHydrationError: null });
      };
      updateWorkspaceHydrationError = (error: unknown) => {
        set({
          isHydrated: false,
          workspaceHydrationError: error instanceof Error ? error.message : 'Could not load the workspace.'
        });
      };
      const boundaryAwareSet: typeof set = (partial) => {
        set((currentState) => {
          const nextState = typeof partial === 'function' ? partial(currentState) : partial;
          if (nextState === currentState) {
            return currentState;
          }
          return withWorkspaceRendererBoundary(nextState, currentState);
        });
      };

      return ({
      ...initialState,
      ...createWorkspaceLayoutActions(boundaryAwareSet, defaultLayoutState),
      setActiveNode: (nodeId) => {
        boundaryAwareSet((state) => {
          if (!isCanonicalVisibleNodeId(state, nodeId)) {
            return state;
          }
          return {
            activeNodeId: nodeId,
            nodeViewById: markNodeOpenedViewState(state, nodeId),
            reviewSession: reconcileReviewSession(state, nodeId)
          };
        });
      },
      ...createWorkspaceNavigationActions(boundaryAwareSet),
      ...createWorkspaceActionHistoryActions(boundaryAwareSet, get),
      ...createWorkspaceEditorOperationHistoryActions(boundaryAwareSet, get),
      ...createWorkspaceNodeActions(boundaryAwareSet),
      ...createWorkspaceReviewActions(boundaryAwareSet, get)
    });
    },
    createWorkspaceStorePersistConfig((error) => {
      if (error) {
        updateWorkspaceHydrationError(error);
        return;
      }
      updateWorkspaceHydrationState();
    })
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
      return withWorkspaceRendererBoundary(
        'activeNodeId' in nextState || !('nodesById' in nextState)
          ? nextState
          : { ...nextState, activeNodeId: currentState.activeNodeId },
        currentState
      );
    };

    if (replace) {
      return rawWorkspaceSetState(nextPartial as (state: WorkspaceState) => WorkspaceState, true);
    }

    return rawWorkspaceSetState(nextPartial, false);
  }) as typeof workspaceStore.setState;

registerPendingNodeSyncRendererBoundary(workspaceStore);

export const useWorkspaceStore = workspaceStore;
