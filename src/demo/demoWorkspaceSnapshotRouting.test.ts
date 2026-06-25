import { expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { createInitialWorkspaceState, useWorkspaceStore, WORKSPACE_STORAGE_KEY } from '../store/workspaceStore';

import { canonicalGuidePath, DEMO_TOPICS, getDemoTopicNodeId } from './demoContent';
import { DEMO_GUIDES_NODE_ID } from './demoGuides';
import { DEMO_CAPTURED_VERSION, DEMO_SNAPSHOT_VERSION } from './demoLocalStorage';
import { createDemoWorkspaceSnapshot, installDemoWorkspaceSnapshot, resolveDemoTopicFromPath } from './demoWorkspaceSnapshot';

function requireTopic(index: number) {
  const topic = DEMO_TOPICS[index];
  if (!topic) throw new Error(`Missing Demo topic fixture at index ${index}.`);
  return topic;
}

it('selects locale-prefixed Demo topic URLs', () => {
  const topic = requireTopic(0);

  expect(resolveDemoTopicFromPath(canonicalGuidePath(topic.slug, 'ja'))).toBe(topic);
  expect(createDemoWorkspaceSnapshot(canonicalGuidePath(topic.slug, 'zh-hans')).activeNodeId).toBe(
    getDemoTopicNodeId(topic)
  );
});

it('routes a compatible browser-local payload to the current Demo topic URL', async () => {
  const storage = new Map<string, string>();
  const firstTopic = requireTopic(0);
  seedDemoStorage(storage, '/ja/demo/');
  await installDemoWorkspaceSnapshot(canonicalGuidePath(firstTopic.slug, 'ja'));
  stubDemoWindow(storage, canonicalGuidePath(firstTopic.slug, 'ja'));

  await installDemoWorkspaceSnapshot();

  const nextPayload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
  expect(nextPayload.state.activeNodeId).toBe(getDemoTopicNodeId(firstTopic));
  expect(nextPayload.state.reviewSession.currentNodeId).toBe(getDemoTopicNodeId(firstTopic));
  expect(nextPayload.state.reviewSession.queueNodeIds[0]).toBe(getDemoTopicNodeId(firstTopic));
  vi.unstubAllGlobals();
});

it('keeps a compatible browser-local payload on the Demo app entry', async () => {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-06-17T00:00:00.000Z')));
  const storage = new Map<string, string>();
  storage.set(DEMO_SNAPSHOT_VERSION, DEMO_CAPTURED_VERSION);
  const payload = {
    state: createDemoWorkspaceSnapshot('/en/demo/'),
    version: 0
  };
  payload.state.activeNodeId = INBOX_NODE_ID;
  payload.state.reviewSession.currentNodeId = INBOX_NODE_ID;
  payload.state.reviewSession.queueNodeIds = [INBOX_NODE_ID];
  storage.set(WORKSPACE_STORAGE_KEY, JSON.stringify(payload));
  expect(JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null').state.activeNodeId).toBe(INBOX_NODE_ID);
  stubDemoWindow(storage, '/en/demo/');

  await installDemoWorkspaceSnapshot();

  const nextPayload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
  expect(nextPayload.state.activeNodeId).toBe(INBOX_NODE_ID);
  expect(nextPayload.state.reviewSession.currentNodeId).toBe(INBOX_NODE_ID);
  expect(nextPayload.state.reviewSession.queueNodeIds[0]).toBe(INBOX_NODE_ID);
  vi.unstubAllGlobals();
});

it('rebuilds Demo sequential reading from the Guides topic order', () => {
  const topic = requireTopic(0);
  const now = new Date('2026-06-17T00:00:00.000Z');
  useWorkspaceStore.setState({
    ...createDemoWorkspaceSnapshot(canonicalGuidePath(topic.slug), now),
    isHydrated: true,
    workspaceHydrationError: null
  });

  expect(useWorkspaceStore.getState().setNodeSequentialReading(DEMO_GUIDES_NODE_ID, true, now.toISOString())).toBe(true);
  const state = useWorkspaceStore.getState();
  const topicNodeId = getDemoTopicNodeId(topic);
  const expectedQueue = DEMO_TOPICS
    .filter((demoTopic) => demoTopic.id === topic.id || demoTopic.parentId === topic.id)
    .map(getDemoTopicNodeId);

  expect(state.activeNodeId).toBe(topicNodeId);
  expect(state.reviewSession.currentNodeId).toBe(topicNodeId);
  expect(state.reviewSession.queueNodeIds).toEqual(expectedQueue);
  expect(state.nodesById[topicNodeId]?.reading?.state).toBe('active');
});

function seedDemoStorage(storage: Map<string, string>, pathname: string) {
  stubDemoWindow(storage, pathname);
  storage.set(DEMO_SNAPSHOT_VERSION, DEMO_CAPTURED_VERSION);
  const snapshot = createDemoWorkspaceSnapshot(canonicalGuidePath(requireTopic(0).slug));
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
