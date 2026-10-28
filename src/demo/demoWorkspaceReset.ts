import { emptyBrowserDailyFlow } from '../shared/platform/runtime/browserDailyFlowState';
import { replaceBrowserWorkspace } from '../store/installBrowserWorkspace';
import { createInitialWorkspaceState, useWorkspaceStore } from '../store/workspaceStore';

import { DEMO_TOPICS_BY_LOCALE, getDemoTopicsForLocale, getDemoTopicNodeId } from './demoContent';
import { DEMO_CAPTURED_VERSION, DEMO_SNAPSHOT_VERSION } from './demoLocalStorage';
import { resolveDemoLocalePathSegment } from './demoRoutes';
import { createDemoWorkspaceSnapshot, renderDemoTopicMarkdown } from './demoWorkspaceSnapshot';

export function syncDemoWorkspaceSnapshotLocale(pathname = window.location.pathname) {
  const topics = getDemoTopicsForLocale(resolveDemoLocalePathSegment(pathname));
  const state = useWorkspaceStore.getState();
  const nodesById = { ...state.nodesById };
  let changed = false;
  for (const topic of topics) {
    const id = getDemoTopicNodeId(topic);
    const node = nodesById[id];
    if (!node) continue;
    const originals = Object.values(DEMO_TOPICS_BY_LOCALE).flatMap(items => items.filter(item => item.id === topic.id));
    const title = originals.some(item => item.title === node.title) ? topic.title : node.title;
    const content = originals.some(item => renderDemoTopicMarkdown(item) === node.content) ? renderDemoTopicMarkdown(topic) : node.content;
    const openingText = originals.some(item => item.summary === node.openingText) ? topic.summary : node.openingText;
    if (title === node.title && content === node.content && openingText === node.openingText) continue;
    nodesById[id] = { ...node, title, content, ...(openingText === undefined ? {} : { openingText }) };
    changed = true;
  }
  if (changed) useWorkspaceStore.setState({ nodesById });
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
