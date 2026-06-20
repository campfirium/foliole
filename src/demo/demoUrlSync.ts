import type { AppLanguagePreference, AppLocale } from '../shared/localization/appLanguage';
import { useWorkspaceStore } from '../store/workspaceStore';

import { canonicalDemoPath, DEMO_TOPICS } from './demoContent';

const DEMO_ROUTE_LOCALE_PATTERN = /^\/([a-z]{2}(?:-[a-z]+)?)\/demo\//i;

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

export function syncDemoUrlToNode(nodeId: string | null, locale = resolveCurrentLocalePathSegment()) {
  const topic = DEMO_TOPICS.find((demoTopic) => `demo-${demoTopic.slug}` === nodeId);
  if (!topic) return;
  const nextPath = canonicalDemoPath(topic.slug, locale);
  if (window.location.pathname === nextPath) return;
  window.history.replaceState(window.history.state, '', nextPath);
}

export function resolveDemoLanguagePreferenceFromPath(pathname: string): AppLanguagePreference | undefined {
  const match = DEMO_ROUTE_LOCALE_PATTERN.exec(pathname);
  const locale = match?.[1]?.toLowerCase();
  if (locale === 'en') return 'en';
  if (locale === 'zh-hans') return 'zh-Hans';
  return undefined;
}

export function demoPathSegmentFromLocale(locale: AppLocale) {
  return locale === 'zh-Hans' ? 'zh-hans' : 'en';
}

function resolveCurrentLocalePathSegment() {
  const match = DEMO_ROUTE_LOCALE_PATTERN.exec(window.location.pathname);
  return match?.[1]?.toLowerCase() ?? 'en';
}
