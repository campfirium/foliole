import { browserLocalWorkspaceReviewPersistence } from '../store/workspaceReviewPersistence';
import { createInitialWorkspaceState, useWorkspaceStore, WORKSPACE_STORAGE_KEY } from '../store/workspaceStore';
import { createWorkspaceReviewActions } from '../store/workspaceStoreReviewActions';

import { DEMO_CAPTURED_VERSION, DEMO_SNAPSHOT_VERSION } from './demoLocalStorage';
import { createDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

export function resetDemoWorkspaceSnapshot(pathname = window.location.pathname) {
  const snapshot = createDemoWorkspaceSnapshot(pathname);
  window.localStorage.setItem(
    WORKSPACE_STORAGE_KEY,
    JSON.stringify({ state: snapshot, version: 0 })
  );
  window.localStorage.setItem(DEMO_SNAPSHOT_VERSION, DEMO_CAPTURED_VERSION);
  useWorkspaceStore.setState({
    ...createInitialWorkspaceState(),
    ...snapshot,
    isHydrated: true,
    workspaceHydrationError: null
  });
  useWorkspaceStore.setState(createWorkspaceReviewActions(
    useWorkspaceStore.setState,
    useWorkspaceStore.getState,
    undefined,
    browserLocalWorkspaceReviewPersistence,
    { startReviewSession: { includeScheduledFallback: true } }
  ));
}
