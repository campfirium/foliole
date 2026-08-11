import { expect, it, vi } from 'vitest';

import { APP_LANGUAGE_STORAGE_KEY } from '../shared/localization/appLanguage';

import { DEMO_TOPICS, getDemoTopicNodeId } from './demoContent';
import {
  acceptDemoLanguagePreferenceFromSearch,
  demoPathSegmentFromLocale,
  resolveDemoInitialLanguagePreference,
  resolveDemoLanguagePreferenceFromPath,
  resolveDemoLanguagePreferenceFromSearch,
  syncDemoUrlToNode
} from './demoUrlSync';

it('resolves only supported Demo route locale prefixes into runtime language preferences', () => {
  expect(resolveDemoLanguagePreferenceFromPath('/en/demo/')).toBe('en');
  expect(resolveDemoLanguagePreferenceFromPath('/zh-hans/guides/welcome-to-foliole/')).toBe('zh-Hans');
  expect(resolveDemoLanguagePreferenceFromPath('/zh-hant/guides/welcome-to-foliole/')).toBe('zh-Hant');
  expect(resolveDemoLanguagePreferenceFromPath('/pt/demo/')).toBe('pt-BR');
  expect(resolveDemoLanguagePreferenceFromPath('/nl/demo/')).toBeUndefined();
  expect(resolveDemoLanguagePreferenceFromSearch('?lang=pt-BR')).toBe('pt-BR');
  expect(resolveDemoLanguagePreferenceFromSearch('?lang=nl')).toBeUndefined();
  expect(demoPathSegmentFromLocale('en')).toBe('en');
  expect(demoPathSegmentFromLocale('zh-Hans')).toBe('zh-hans');
  expect(demoPathSegmentFromLocale('de')).toBe('de');
  expect(demoPathSegmentFromLocale('pt-BR')).toBe('pt');
});

it('resolves website context, route, persisted choice, then system fallback in order', () => {
  expect(resolveDemoInitialLanguagePreference('/en/demo/', '?lang=ja', 'system')).toBe('ja');
  expect(resolveDemoInitialLanguagePreference('/en/demo/', '?lang=ja', 'de')).toBe('ja');
  expect(resolveDemoInitialLanguagePreference('/en/demo/', '?lang=ja', null)).toBe('ja');
  expect(resolveDemoInitialLanguagePreference('/ja/demo/', '', 'de')).toBe('ja');
  expect(resolveDemoInitialLanguagePreference('/zh-hans/demo/', '', null)).toBe('zh-Hans');
  expect(resolveDemoInitialLanguagePreference('/en/demo/', '?lang=nl', null)).toBe('en');
});

it('persists a supported website language as the next Demo preference', () => {
  window.localStorage.clear();

  expect(acceptDemoLanguagePreferenceFromSearch('?lang=ja')).toBe('ja');
  expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe('ja');
  expect(acceptDemoLanguagePreferenceFromSearch('?lang=nl')).toBeUndefined();
  expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe('ja');

  window.localStorage.clear();
});

it('keeps the active topic on a published route while carrying website language context', () => {
  const firstTopic = DEMO_TOPICS[0];
  if (!firstTopic) throw new Error('Demo URL sync test requires one topic.');
  const replaceState = vi.fn();
  vi.stubGlobal('window', {
    history: { replaceState, state: null },
    location: { hash: '', pathname: `/en/guides/${firstTopic.slug}/`, search: '?source=site' }
  });

  syncDemoUrlToNode(getDemoTopicNodeId(firstTopic), 'de', 'de');

  expect(replaceState).toHaveBeenCalledWith(
    null,
    '',
    `/de/guides/${firstTopic.slug}/?source=site`
  );
  vi.unstubAllGlobals();
});

it('keeps locale Demo entry URLs stable while active nodes change', () => {
  const firstTopic = DEMO_TOPICS[0];
  if (!firstTopic) throw new Error('Demo URL sync test requires one topic.');
  const replaceState = vi.fn();
  vi.stubGlobal('window', {
    history: { replaceState, state: null },
    location: { hash: '', pathname: '/en/demo/', search: '' }
  });

  syncDemoUrlToNode(getDemoTopicNodeId(firstTopic), 'en', 'en');

  expect(replaceState).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it('keeps a Japanese website route after the Demo runtime starts', () => {
  const replaceState = vi.fn();
  vi.stubGlobal('window', {
    history: { replaceState, state: null },
    location: { hash: '', pathname: '/ja/demo/', search: '?lang=ja' }
  });

  syncDemoUrlToNode('inbox', 'ja', 'ja');

  expect(replaceState).toHaveBeenCalledWith(null, '', '/ja/demo/');
  vi.unstubAllGlobals();
});

it('uses the published Chinese path without a redundant language query', () => {
  const firstTopic = DEMO_TOPICS[0];
  if (!firstTopic) throw new Error('Demo URL sync test requires one topic.');
  const replaceState = vi.fn();
  vi.stubGlobal('window', {
    history: { replaceState, state: null },
    location: { hash: '', pathname: '/en/demo/', search: '?lang=de' }
  });

  syncDemoUrlToNode(getDemoTopicNodeId(firstTopic), 'zh-Hans', 'zh-Hans');

  expect(replaceState).toHaveBeenCalledWith(null, '', '/zh-hans/demo/');
  vi.unstubAllGlobals();
});

it('keeps System explicit and rewrites non-public nodes to a refresh-safe route', () => {
  const replaceState = vi.fn();
  vi.stubGlobal('window', {
    history: { replaceState, state: null },
    location: { hash: '#current', pathname: '/zh-hans/guides/welcome-to-foliole/', search: '' }
  });

  syncDemoUrlToNode('inbox', 'system', 'zh-Hans');

  expect(replaceState).toHaveBeenCalledWith(null, '', '/zh-hans/demo/?lang=system#current');
  vi.unstubAllGlobals();
});
