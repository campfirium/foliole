import { emptyBrowserDailyFlow } from '../shared/platform/runtime/browserDailyFlowState';
import { replaceBrowserWorkspace } from '../store/installBrowserWorkspace';
import { createInitialWorkspaceState, useWorkspaceStore } from '../store/workspaceStore';

import { getDemoTopicsForLocale, getDemoTopicNodeId } from './demoContent';
import { DEMO_CAPTURED_VERSION, DEMO_SNAPSHOT_VERSION } from './demoLocalStorage';
import { resolveDemoLocalePathSegment } from './demoRoutes';
import { createDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

export function syncDemoWorkspaceSnapshotLocale(pathname = window.location.pathname) {
  const topics = getDemoTopicsForLocale(resolveDemoLocalePathSegment(pathname));
  const nodesById = useWorkspaceStore.getState().nodesById;
  const hasCurrentLocale = topics.every((topic) => nodesById[getDemoTopicNodeId(topic)]?.title === topic.title);
  if (!hasCurrentLocale) {
    resetDemoWorkspaceSnapshot(pathname);
  }
}

export function resetDemoWorkspaceSnapshot(pathname = window.location.pathname) {
  const snapshot = createDemoWorkspaceSnapshot(pathname);
  replaceBrowserWorkspace(useWorkspaceStore, window.localStorage, {
    ...createInitialWorkspaceState(),
    ...snapshot,
    browserDailyFlow: emptyBrowserDailyFlow(),
    isHydrated: true,
    workspaceHydrationError: null
  });
  window.localStorage.setItem(DEMO_SNAPSHOT_VERSION, DEMO_CAPTURED_VERSION);
}
