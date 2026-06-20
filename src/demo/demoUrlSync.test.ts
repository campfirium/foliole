import { expect, it, vi } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore } from '../store/workspaceStore';

import { DEMO_TOPICS } from './demoContent';
import {
  demoPathSegmentFromLocale,
  installDemoUrlSync,
  resolveDemoLanguagePreferenceFromPath,
  syncDemoUrlToNode
} from './demoUrlSync';

it('resolves only supported Demo route locale prefixes into runtime language preferences', () => {
  expect(resolveDemoLanguagePreferenceFromPath('/en/demo/focused-reading-review/')).toBe('en');
  expect(resolveDemoLanguagePreferenceFromPath('/zh-hans/demo/focused-reading-review/')).toBe('zh-Hans');
  expect(resolveDemoLanguagePreferenceFromPath('/zh-hant/demo/focused-reading-review/')).toBeUndefined();
  expect(resolveDemoLanguagePreferenceFromPath('/ja/demo/focused-reading-review/')).toBeUndefined();
  expect(demoPathSegmentFromLocale('en')).toBe('en');
  expect(demoPathSegmentFromLocale('zh-Hans')).toBe('zh-hans');
});

it('keeps the browser URL aligned with the active official Demo topic', () => {
  const firstTopic = DEMO_TOPICS[0];
  const secondTopic = DEMO_TOPICS[1];
  if (!firstTopic || !secondTopic) throw new Error('Demo URL sync test requires two topics.');
  const replaceState = vi.fn();
  vi.stubGlobal('window', {
    history: { replaceState, state: null },
    localStorage: {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn()
    },
    location: { pathname: `/zh-hans/demo/${firstTopic.slug}/` }
  });
  useWorkspaceStore.setState({
    ...createInitialWorkspaceState(new Date('2026-06-17T00:00:00.000Z')),
    activeNodeId: `demo-${firstTopic.slug}`
  });

  const unsubscribe = installDemoUrlSync();
  useWorkspaceStore.setState({ activeNodeId: `demo-${secondTopic.slug}` });

  expect(replaceState).toHaveBeenCalledWith(null, '', `/zh-hans/demo/${secondTopic.slug}/`);
  unsubscribe();
  vi.unstubAllGlobals();
});

it('rewrites the active official Demo topic with the provided locale segment', () => {
  const firstTopic = DEMO_TOPICS[0];
  if (!firstTopic) throw new Error('Demo URL sync test requires one topic.');
  const replaceState = vi.fn();
  vi.stubGlobal('window', {
    history: { replaceState, state: null },
    location: { pathname: `/en/demo/${firstTopic.slug}/` }
  });

  syncDemoUrlToNode(`demo-${firstTopic.slug}`, 'zh-hans');

  expect(replaceState).toHaveBeenCalledWith(null, '', `/zh-hans/demo/${firstTopic.slug}/`);
  vi.unstubAllGlobals();
});
