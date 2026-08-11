import { expect, it, vi } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore } from '../store/workspaceStore';

import { DEMO_TOPICS, getDemoTopicNodeId } from './demoContent';
import {
  demoPathSegmentFromLocale,
  installDemoUrlSync,
  resolveDemoInitialLanguagePreference,
  resolveDemoLanguagePreferenceFromPath,
  syncDemoUrlToNode
} from './demoUrlSync';

it('resolves only supported Demo route locale prefixes into runtime language preferences', () => {
  expect(resolveDemoLanguagePreferenceFromPath('/en/demo/')).toBe('en');
  expect(resolveDemoLanguagePreferenceFromPath('/zh-hans/guides/welcome-to-foliole/')).toBe('zh-Hans');
  expect(resolveDemoLanguagePreferenceFromPath('/zh-hant/guides/welcome-to-foliole/')).toBe('zh-Hant');
  expect(resolveDemoLanguagePreferenceFromPath('/pt-br/demo/')).toBe('pt-BR');
  expect(resolveDemoLanguagePreferenceFromPath('/nl/demo/')).toBeUndefined();
  expect(demoPathSegmentFromLocale('en')).toBe('en');
  expect(demoPathSegmentFromLocale('zh-Hans')).toBe('zh-hans');
});

it('keeps a persisted Demo language preference ahead of the route default', () => {
  expect(resolveDemoInitialLanguagePreference('/ja/demo/', 'system')).toBe('system');
  expect(resolveDemoInitialLanguagePreference('/ja/demo/', 'de')).toBe('de');
  expect(resolveDemoInitialLanguagePreference('/ja/demo/', null)).toBe('ja');
});

it('keeps the browser URL aligned with the active official Demo topic', () => {
  const firstTopic = DEMO_TOPICS[0];
  if (!firstTopic) throw new Error('Demo URL sync test requires one topic.');
  const replaceState = vi.fn();
  vi.stubGlobal('window', {
    history: { replaceState, state: null },
    localStorage: {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn()
    },
    location: { pathname: `/zh-hans/guides/${firstTopic.slug}/` }
  });
  useWorkspaceStore.setState({
    ...createInitialWorkspaceState(new Date('2026-06-17T00:00:00.000Z')),
    activeNodeId: getDemoTopicNodeId(firstTopic)
  });

  const unsubscribe = installDemoUrlSync();
  useWorkspaceStore.setState({ activeNodeId: 'special-inbox' });

  expect(replaceState).toHaveBeenCalledWith(null, '', '/zh-hans/demo/');
  unsubscribe();
  vi.unstubAllGlobals();
});

it('rewrites the active official Demo topic with the provided locale segment', () => {
  const firstTopic = DEMO_TOPICS[0];
  if (!firstTopic) throw new Error('Demo URL sync test requires one topic.');
  const replaceState = vi.fn();
  vi.stubGlobal('window', {
    history: { replaceState, state: null },
    location: { pathname: `/en/guides/${firstTopic.slug}/` }
  });

  syncDemoUrlToNode(getDemoTopicNodeId(firstTopic), 'zh-hans');

  expect(replaceState).toHaveBeenCalledWith(null, '', `/zh-hans/guides/${firstTopic.slug}/`);
  vi.unstubAllGlobals();
});

it('keeps locale Demo entry URLs stable while active nodes change', () => {
  const firstTopic = DEMO_TOPICS[0];
  if (!firstTopic) throw new Error('Demo URL sync test requires one topic.');
  const replaceState = vi.fn();
  vi.stubGlobal('window', {
    history: { replaceState, state: null },
    location: { pathname: '/en/demo/' }
  });

  syncDemoUrlToNode(getDemoTopicNodeId(firstTopic), 'en');

  expect(replaceState).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it('updates only the locale segment for locale Demo entry URLs', () => {
  const firstTopic = DEMO_TOPICS[0];
  if (!firstTopic) throw new Error('Demo URL sync test requires one topic.');
  const replaceState = vi.fn();
  vi.stubGlobal('window', {
    history: { replaceState, state: null },
    location: { pathname: '/en/demo/' }
  });

  syncDemoUrlToNode(getDemoTopicNodeId(firstTopic), 'zh-hans');

  expect(replaceState).toHaveBeenCalledWith(null, '', '/zh-hans/demo/');
  vi.unstubAllGlobals();
});

it('rewrites non-public Demo workspace nodes to the locale Demo entry', () => {
  const replaceState = vi.fn();
  vi.stubGlobal('window', {
    history: { replaceState, state: null },
    location: { pathname: '/zh-hans/guides/welcome-to-foliole/' }
  });

  syncDemoUrlToNode('inbox', 'zh-hans');

  expect(replaceState).toHaveBeenCalledWith(null, '', '/zh-hans/demo/');
  vi.unstubAllGlobals();
});
