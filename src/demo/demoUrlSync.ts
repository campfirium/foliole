import { APP_LOCALES } from '../../lib/core/localization/appLocaleRegistry';
import type { AppLanguagePreference, AppLocale } from '../shared/localization/appLanguage';
import { useWorkspaceStore } from '../store/workspaceStore';

import { canonicalDemoPath, DEMO_TOPICS, getDemoTopicNodeId } from './demoContent';
import { canonicalGuidePath, isLocaleDemoPath, resolveDemoLocalePathSegment } from './demoRoutes';

const DEMO_ROUTE_LOCALE_PATTERN = /^\/([a-z]{2}(?:-[a-z]+)?)\/(?:demo|guides)\//i;

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
  if (isLocaleDemoPath(window.location.pathname)) {
    const demoPath = canonicalDemoPath(locale);
    if (window.location.pathname !== demoPath) {
      window.history.replaceState(window.history.state, '', demoPath);
    }
    return;
  }
  const topic = DEMO_TOPICS.find((demoTopic) => getDemoTopicNodeId(demoTopic) === nodeId);
  const nextPath = topic ? canonicalGuidePath(topic.slug, locale) : canonicalDemoPath(locale);
  if (window.location.pathname === nextPath) return;
  window.history.replaceState(window.history.state, '', nextPath);
}

export function resolveDemoLanguagePreferenceFromPath(pathname: string): AppLanguagePreference | undefined {
  const match = DEMO_ROUTE_LOCALE_PATTERN.exec(pathname);
  const locale = match?.[1]?.toLowerCase();
  return APP_LOCALES.find((candidate) => candidate.toLowerCase() === locale);
}

export function resolveDemoInitialLanguagePreference(
  pathname: string,
  persistedPreference: AppLanguagePreference | null
): AppLanguagePreference | undefined {
  return persistedPreference ?? resolveDemoLanguagePreferenceFromPath(pathname);
}

export function demoPathSegmentFromLocale(locale: AppLocale) {
  return locale.toLowerCase();
}

function resolveCurrentLocalePathSegment() {
  return resolveDemoLocalePathSegment(window.location.pathname);
}
