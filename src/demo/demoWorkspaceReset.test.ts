import { expect, it, vi } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';
import { createInitialWorkspaceState, useWorkspaceStore, WORKSPACE_STORAGE_KEY } from '../store/workspaceStore';

import { canonicalGuidePath, DEMO_TOPICS, getDemoTopicNodeId } from './demoContent';
import { DEMO_GUIDES_NODE_ID } from './demoGuides';
import { DEMO_CAPTURED_VERSION, DEMO_SNAPSHOT_VERSION, readDemoPreviewDay, writeDemoPreviewDay } from './demoLocalStorage';
import { createBrowserDemoRuntimeController } from './demoRuntimeController';
import { resetDemoWorkspaceSnapshot } from './demoWorkspaceReset';
import { createDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

function stubDemoStorage(storage: Map<string, string>, pathname: string) {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      }
    },
    location: { pathname }
  });
}

function createFutureFlowTopic(id: string): Node {
  return {
    id,
    parentNodeId: null,
    kind: 'topic',
    title: id,
    content: `${id} body`,
    reveal: null,
    review: null,
    reading: {
      intervalDurationMs: 24 * 60 * 60 * 1000,
      intervalGrowthFactor: 1.3,
      lastHandledAt: '2026-06-19T00:00:00.000Z',
      nextAt: '2026-06-22T00:00:00.000Z',
      priority: 5,
      readingPosition: 0,
      repetitionCount: 1,
      state: 'active'
    },
    createdAt: '2026-06-19T00:00:00.000Z',
    updatedAt: '2026-06-19T00:00:00.000Z'
  };
}

it('forces the current Demo store back to the official snapshot', () => {
  const topic = DEMO_TOPICS[0];
  if (!topic) throw new Error('Demo reset test requires a topic.');
  const pathname = canonicalGuidePath(topic.slug);
  const storage = new Map<string, string>();
  stubDemoStorage(storage, pathname);
  useWorkspaceStore.setState({
    ...createInitialWorkspaceState(new Date('2026-06-19T00:00:00.000Z')),
    activeNodeId: 'imported-local-topic',
    nodeOrder: ['imported-local-topic'],
    nodesById: {}
  });

  resetDemoWorkspaceSnapshot(pathname);

  const state = useWorkspaceStore.getState();
  const payload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
  expect(state.activeNodeId).toBe(getDemoTopicNodeId(topic));
  expect(state.nodesById[getDemoTopicNodeId(topic)]).toMatchObject({
    bodyStatus: 'ready',
    hasContent: true,
    parentNodeId: DEMO_GUIDES_NODE_ID,
    title: topic.title
  });
  expect(state.nodesById[DEMO_GUIDES_NODE_ID]).toMatchObject({ kind: 'folder', title: 'Guides' });
  expect(payload.state.activeNodeId).toBe(getDemoTopicNodeId(topic));
  expect(storage.get(DEMO_SNAPSHOT_VERSION)).toBe(DEMO_CAPTURED_VERSION);
  vi.unstubAllGlobals();
});

it('resets Demo learning state back to the official seed', () => {
  const topic = DEMO_TOPICS[0];
  if (!topic) throw new Error('Demo reset test requires a topic.');
  const pathname = canonicalGuidePath(topic.slug);
  const topicNodeId = getDemoTopicNodeId(topic);
  const storage = new Map<string, string>();
  stubDemoStorage(storage, pathname);
  const pollutedState = createDemoWorkspaceSnapshot(pathname, new Date('2026-06-19T00:00:00.000Z'));
  pollutedState.nodesById[topicNodeId] = {
    ...pollutedState.nodesById[topicNodeId]!,
    reading: {
      intervalDurationMs: 0,
      intervalGrowthFactor: 1,
      lastHandledAt: '2026-06-18T00:00:00.000Z',
      nextAt: '2026-06-25T00:00:00.000Z',
      priority: 9,
      readingPosition: 99,
      repetitionCount: 99,
      state: 'dismissed'
    }
  };
  useWorkspaceStore.setState({
    ...pollutedState,
    reviewSession: {
      ...pollutedState.reviewSession,
      isAnswerRevealed: true,
      soonNodeIds: [topicNodeId]
    },
    reviewSessionMode: 'reading-only'
  });

  resetDemoWorkspaceSnapshot(pathname);

  const state = useWorkspaceStore.getState();
  const payload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
  expect(state.reviewSessionMode).toBe('recommended');
  expect(state.reviewSession.isAnswerRevealed).toBe(false);
  expect(state.reviewSession).not.toHaveProperty('soonNodeIds');
  expect(state.nodesById[topicNodeId]?.reading).toMatchObject({
    priority: topic.readingSeed.priority,
    readingPosition: topic.readingSeed.readingPosition,
    repetitionCount: topic.readingSeed.repetitionCount,
    state: topic.readingSeed.state
  });
  expect(payload.state.nodesById[topicNodeId].reading.state).toBe(topic.readingSeed.state);
  vi.unstubAllGlobals();
});

it('keeps scheduled Flow fallback available after Demo reset', () => {
  const topic = DEMO_TOPICS[0];
  if (!topic) throw new Error('Demo reset test requires a topic.');
  const pathname = canonicalGuidePath(topic.slug);
  const storage = new Map<string, string>();
  stubDemoStorage(storage, pathname);

  resetDemoWorkspaceSnapshot(pathname);
  useWorkspaceStore.setState({
    activeNodeId: null,
    nodeOrder: ['future-topic'],
    nodesById: { 'future-topic': createFutureFlowTopic('future-topic') },
    reviewSession: {
      currentNodeId: null,
      isAnswerRevealed: false,
      queueNodeIds: [],
      totalNodeCount: 0
    }
  });

  expect(useWorkspaceStore.getState().startReviewSession('2026-06-20T00:00:00.000Z')).toBe(true);
  expect(useWorkspaceStore.getState().reviewSession.currentNodeId).toBe('future-topic');
  vi.unstubAllGlobals();
});

it('clears browser-local Demo state and immediately reinstalls the official snapshot', async () => {
  const topic = DEMO_TOPICS[0];
  if (!topic) throw new Error('Demo reset test requires a topic.');
  const pathname = canonicalGuidePath(topic.slug);
  const storage = new Map<string, string>();
  stubDemoStorage(storage, pathname);
  writeDemoPreviewDay(4);
  useWorkspaceStore.setState({
    ...createInitialWorkspaceState(new Date('2026-06-19T00:00:00.000Z')),
    activeNodeId: 'imported-local-topic',
    nodeOrder: ['imported-local-topic'],
    nodesById: {}
  });

  const cleared = await createBrowserDemoRuntimeController().clearLocalData();

  expect(cleared).toBe(true);
  expect(readDemoPreviewDay()).toBe(0);
  expect(useWorkspaceStore.getState().activeNodeId).toBe(getDemoTopicNodeId(topic));
  expect(storage.get(DEMO_SNAPSHOT_VERSION)).toBe(DEMO_CAPTURED_VERSION);
  vi.unstubAllGlobals();
});

it('combines natural elapsed days with Demo manual day advances', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-20T00:00:00.000Z'));
  const storage = new Map<string, string>();
  stubDemoStorage(storage, canonicalGuidePath(DEMO_TOPICS[0]!.slug));
  storage.set('foliole-demo-started-at-v1', '2026-06-18T00:00:00.000Z');
  writeDemoPreviewDay(1);

  const controller = createBrowserDemoRuntimeController();

  expect(controller.getState().previewDay).toBe(3);
  expect(controller.getNowIso(new Date('2026-06-20T12:00:00.000Z'))).toBe('2026-06-21T12:00:00.000Z');

  controller.continueToNextPreviewDay();

  expect(readDemoPreviewDay()).toBe(2);
  expect(controller.getState().previewDay).toBe(4);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
