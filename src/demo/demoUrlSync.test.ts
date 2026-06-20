import { expect, it, vi } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore } from '../store/workspaceStore';

import { DEMO_TOPICS } from './demoContent';
import { installDemoUrlSync } from './demoUrlSync';

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
