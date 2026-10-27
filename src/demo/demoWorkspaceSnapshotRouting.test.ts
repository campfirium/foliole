import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { installBrowserDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowBrowserRuntime';
import { installWorkspaceBrowserCommit } from '../store/workspaceBrowserCommit';
import { createInitialWorkspaceState, useWorkspaceStore, WORKSPACE_STORAGE_KEY } from '../store/workspaceStore';

import { canonicalGuidePath, DEMO_TOPICS, getDemoTopicNodeId } from './demoContent';
import { DEMO_GUIDES_NODE_ID } from './demoGuides';
import { DEMO_CAPTURED_VERSION, DEMO_SNAPSHOT_VERSION } from './demoLocalStorage';
import { createDemoWorkspaceSnapshot, installDemoWorkspaceSnapshot, resolveDemoTopicFromPath } from './demoWorkspaceSnapshot';

beforeEach(() => {
  installWorkspaceBrowserCommit(null);
  installBrowserDailyFlowRuntime(null);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-17T00:00:00.000Z'));
});
afterEach(() => { installWorkspaceBrowserCommit(null); installBrowserDailyFlowRuntime(null); vi.useRealTimers(); vi.unstubAllGlobals(); });

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
  expect(nextPayload.state.reviewSession.currentNodeId).toBeNull();
  expect(nextPayload.state.reviewSession.queueNodeIds).toEqual([]);
  vi.unstubAllGlobals();
});

it('keeps a compatible browser-local payload on the Demo app entry', async () => {
  installWorkspaceBrowserCommit({ save() {} });
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-06-17T00:00:00.000Z')));
  installWorkspaceBrowserCommit(null);
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

it('saves sequential reading using the Guides topic order without starting learning', async () => {
  const topic = requireTopic(0);
  const now = new Date('2026-06-17T00:00:00.000Z');
  const storage = new Map<string, string>();
  stubDemoWindow(storage, canonicalGuidePath(topic.slug));
  await installDemoWorkspaceSnapshot();
  expect(await useWorkspaceStore.getState().setNodeSequentialReading(DEMO_GUIDES_NODE_ID, true, now.toISOString())).toBe(true);
  const state = useWorkspaceStore.getState();
  const topicNodeId = getDemoTopicNodeId(topic);
  expect(state.activeNodeId).toBe(topicNodeId);
  expect(state.reviewSession.currentNodeId).toBeNull();
  expect(state.nodesById[DEMO_GUIDES_NODE_ID]?.sequentialReadingEnabled).toBe(true);
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
