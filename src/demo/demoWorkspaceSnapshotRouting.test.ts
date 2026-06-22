import { expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { useWorkspaceStore, WORKSPACE_STORAGE_KEY } from '../store/workspaceStore';

import { canonicalDemoPath, DEMO_TOPICS } from './demoContent';
import { DEMO_GUIDES_NODE_ID } from './demoGuides';
import { DEMO_CAPTURED_VERSION, DEMO_SNAPSHOT_VERSION } from './demoLocalStorage';
import { createDemoWorkspaceSnapshot, installDemoWorkspaceSnapshot, resolveDemoTopicFromPath } from './demoWorkspaceSnapshot';

function requireTopic(index: number) {
  const topic = DEMO_TOPICS[index];
  if (!topic) throw new Error(`Missing Demo topic fixture at index ${index}.`);
  return topic;
}

it('selects locale-prefixed Demo topic URLs', () => {
  const topic = requireTopic(1);

  expect(resolveDemoTopicFromPath(canonicalDemoPath(topic.slug, 'ja'))).toBe(topic);
  expect(createDemoWorkspaceSnapshot(canonicalDemoPath(topic.slug, 'zh-hans')).activeNodeId).toBe(
    `demo-${topic.slug}`
  );
});

it('routes a compatible browser-local payload to the current Demo topic URL', async () => {
  const storage = new Map<string, string>();
  const firstTopic = requireTopic(0);
  const secondTopic = requireTopic(1);
  seedDemoStorage(storage, canonicalDemoPath(firstTopic.slug));
  await installDemoWorkspaceSnapshot(canonicalDemoPath(secondTopic.slug, 'ja'));
  stubDemoWindow(storage, canonicalDemoPath(secondTopic.slug, 'ja'));

  await installDemoWorkspaceSnapshot();

  const nextPayload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
  expect(nextPayload.state.activeNodeId).toBe(`demo-${secondTopic.slug}`);
  expect(nextPayload.state.reviewSession.currentNodeId).toBe(`demo-${secondTopic.slug}`);
  expect(nextPayload.state.reviewSession.queueNodeIds[0]).toBe(`demo-${secondTopic.slug}`);
  vi.unstubAllGlobals();
});

it('rebuilds Demo sequential reading from the Guides topic order', () => {
  const firstTopic = requireTopic(0);
  const secondTopic = requireTopic(1);
  const now = new Date('2026-06-17T00:00:00.000Z');
  useWorkspaceStore.setState({
    ...createDemoWorkspaceSnapshot(canonicalDemoPath(secondTopic.slug), now),
    isHydrated: true,
    workspaceHydrationError: null
  });

  expect(useWorkspaceStore.getState().setNodeSequentialReading(DEMO_GUIDES_NODE_ID, true, now.toISOString())).toBe(true);
  const state = useWorkspaceStore.getState();

  expect(state.activeNodeId).toBe(`demo-${firstTopic.slug}`);
  expect(state.reviewSession.currentNodeId).toBe(`demo-${firstTopic.slug}`);
  expect(state.reviewSession.queueNodeIds).toEqual([`demo-${firstTopic.slug}`]);
  expect(state.nodesById[`demo-${secondTopic.slug}`]?.reading?.state).toBe('locked');
});

function seedDemoStorage(storage: Map<string, string>, pathname: string) {
  stubDemoWindow(storage, pathname);
  storage.set(DEMO_SNAPSHOT_VERSION, DEMO_CAPTURED_VERSION);
  const snapshot = createDemoWorkspaceSnapshot(canonicalDemoPath(requireTopic(0).slug));
  storage.set(WORKSPACE_STORAGE_KEY, JSON.stringify({
    state: {
      ...snapshot,
      nodeOrder: [INBOX_NODE_ID, ...Object.keys(snapshot.nodesById)]
    },
    version: 0
  }));
}

function stubDemoWindow(storage: Map<string, string>, pathname: string) {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      },
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value)
    },
    location: { pathname }
  });
}
