import { useWorkspaceStore } from '../store/workspaceStore';

import { canonicalDemoPath, DEMO_TOPICS } from './demoContent';

export function installDemoUrlSync() {
  let previousNodeId = useWorkspaceStore.getState().activeNodeId;
  const unsubscribe = useWorkspaceStore.subscribe((state) => {
    if (state.activeNodeId === previousNodeId) return;
    previousNodeId = state.activeNodeId;
    syncDemoUrlToNode(state.activeNodeId);
  });
  syncDemoUrlToNode(previousNodeId);
  return unsubscribe;
}

function syncDemoUrlToNode(nodeId: string | null) {
  const topic = DEMO_TOPICS.find((demoTopic) => `demo-${demoTopic.slug}` === nodeId);
  if (!topic) return;
  const nextPath = canonicalDemoPath(topic.slug, resolveCurrentLocale());
  if (window.location.pathname === nextPath) return;
  window.history.replaceState(window.history.state, '', nextPath);
}

function resolveCurrentLocale() {
  const match = /^\/([a-z]{2}(?:-[a-z]+)?)\/demo\//i.exec(window.location.pathname);
  return match?.[1]?.toLowerCase() ?? 'en';
}
