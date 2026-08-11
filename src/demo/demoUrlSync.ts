import {
  appLocaleRouteSegment,
  resolveAppLocaleRouteSegment
} from '../../lib/core/localization/appLocaleRegistry';
import {
  isAppLanguagePreference,
  setStoredAppLanguagePreference,
  type AppLanguagePreference,
  type AppLocale
} from '../shared/localization/appLanguage';

import { canonicalDemoPath, DEMO_TOPICS, getDemoTopicNodeId } from './demoContent';
import { canonicalGuidePath, isLocaleDemoPath } from './demoRoutes';

const DEMO_ROUTE_LOCALE_PATTERN = /^\/([a-z]{2}(?:-[a-z]+)?)\/(?:demo|guides)\//i;
export const DEMO_LANGUAGE_QUERY_KEY = 'lang';

export function syncDemoUrlToNode(
  nodeId: string | null,
  languagePreference: AppLanguagePreference,
  locale: AppLocale
) {
  const routeLocale = demoPathSegmentFromLocale(locale);
  const suffix = demoLanguageUrlSuffix(languagePreference, locale, window.location.search, window.location.hash);
  if (isLocaleDemoPath(window.location.pathname)) {
    replaceDemoUrl(`${canonicalDemoPath(routeLocale)}${suffix}`);
    return;
  }
  const topic = DEMO_TOPICS.find((demoTopic) => getDemoTopicNodeId(demoTopic) === nodeId);
  const path = topic ? canonicalGuidePath(topic.slug, routeLocale) : canonicalDemoPath(routeLocale);
  replaceDemoUrl(`${path}${suffix}`);
}

export function resolveDemoLanguagePreferenceFromPath(pathname: string): AppLanguagePreference | undefined {
  const match = DEMO_ROUTE_LOCALE_PATTERN.exec(pathname);
  return match?.[1] ? resolveAppLocaleRouteSegment(match[1]) ?? undefined : undefined;
}

export function resolveDemoInitialLanguagePreference(
  pathname: string,
  search: string,
  persistedPreference: AppLanguagePreference | null
): AppLanguagePreference | undefined {
  return resolveDemoLanguagePreferenceFromSearch(search) ??
    resolveDemoLanguagePreferenceFromPath(pathname) ?? persistedPreference ?? undefined;
}

export function acceptDemoLanguagePreferenceFromSearch(search: string) {
  const preference = resolveDemoLanguagePreferenceFromSearch(search);
  if (preference) setStoredAppLanguagePreference(preference);
  return preference;
}

export function demoPathSegmentFromLocale(locale: AppLocale) {
  return appLocaleRouteSegment(locale);
}

export function resolveDemoLanguagePreferenceFromSearch(search: string) {
  const value = new URLSearchParams(search).get(DEMO_LANGUAGE_QUERY_KEY);
  return value && isAppLanguagePreference(value) ? value : undefined;
}

function demoLanguageUrlSuffix(
  preference: AppLanguagePreference,
  locale: AppLocale,
  search: string,
  hash: string
) {
  const params = new URLSearchParams(search);
  const routeCarriesLanguage = preference === locale;
  if (routeCarriesLanguage) params.delete(DEMO_LANGUAGE_QUERY_KEY);
  else params.set(DEMO_LANGUAGE_QUERY_KEY, preference);
  const query = params.size > 0 ? `?${params.toString()}` : '';
  return `${query}${hash}`;
}

function replaceDemoUrl(nextUrl: string) {
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentUrl !== nextUrl) {
    window.history.replaceState(window.history.state, '', nextUrl);
  }
}
