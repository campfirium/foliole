import { expect, it, vi } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore, WORKSPACE_STORAGE_KEY } from '../store/workspaceStore';

import { canonicalDemoPath, DEMO_TOPICS } from './demoContent';
import { DEMO_GUIDES_NODE_ID } from './demoGuides';
import { DEMO_CAPTURED_VERSION, DEMO_SNAPSHOT_VERSION, readDemoPreviewDay, writeDemoPreviewDay } from './demoLocalStorage';
import { createBrowserDemoRuntimeController } from './demoRuntimeController';
import { resetDemoWorkspaceSnapshot } from './demoWorkspaceReset';

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

function createPollutedDemoLearningState(input: {
  item: NonNullable<(typeof DEMO_TOPICS)[number]['reviewItems'][number]>;
  itemNodeId: string;
  topic: NonNullable<(typeof DEMO_TOPICS)[number]>;
  topicNodeId: string;
}) {
  const topicNode = createPollutedDemoTopicNode(input.topic, input.topicNodeId);
  const itemNode = createPollutedDemoReviewItemNode(input.item, input.itemNodeId, input.topicNodeId);
  return {
    ...createInitialWorkspaceState(new Date('2026-06-19T00:00:00.000Z')),
    activeNodeId: input.itemNodeId,
    nodeOrder: [input.topicNodeId, input.itemNodeId],
    nodesById: {
      [input.topicNodeId]: topicNode,
      [input.itemNodeId]: itemNode
    },
    reviewSession: {
      currentNodeId: input.itemNodeId,
      isAnswerRevealed: true,
      queueNodeIds: [input.itemNodeId],
      soonNodeIds: [input.topicNodeId],
      totalNodeCount: 1
    },
    reviewSessionMode: 'reading-only' as const
  };
}

function createPollutedDemoTopicNode(topic: NonNullable<(typeof DEMO_TOPICS)[number]>, topicNodeId: string) {
  return {
    id: topicNodeId,
    parentNodeId: null,
    kind: 'topic' as const,
    title: topic.title,
    isTitleManual: true,
    content: '',
    openingText: null,
    reveal: null,
    reading: {
      intervalDurationMs: 0,
      intervalGrowthFactor: 1,
      lastHandledAt: '2026-06-18T00:00:00.000Z',
      nextAt: '2026-06-25T00:00:00.000Z',
      priority: 9,
      readingPosition: 99,
      repetitionCount: 99,
      state: 'dismissed' as const
    },
    review: null,
    bodyStatus: 'ready' as const,
    hasContent: true,
    createdAt: '2026-06-19T00:00:00.000Z',
    updatedAt: '2026-06-19T00:00:00.000Z'
  };
}

function createPollutedDemoReviewItemNode(
  item: NonNullable<(typeof DEMO_TOPICS)[number]['reviewItems'][number]>,
  itemNodeId: string,
  topicNodeId: string
) {
  return {
    id: itemNodeId,
    parentNodeId: topicNodeId,
    kind: 'item' as const,
    title: item.title,
    isTitleManual: true,
    content: item.prompt,
    openingText: item.prompt,
    reveal: item.answer,
    reading: null,
    review: {
      due: '2026-06-25T00:00:00.000Z',
      lastReviewAt: '2026-06-20T00:00:00.000Z',
      state: 2 as const,
      stability: 10,
      difficulty: 10,
      elapsedDays: 3,
      scheduledDays: 5,
      reps: 99,
      lapses: 9
    },
    bodyStatus: 'ready' as const,
    hasContent: true,
    hasReveal: item.answer !== null,
    createdAt: '2026-06-19T00:00:00.000Z',
    updatedAt: '2026-06-19T00:00:00.000Z'
  };
}

it('forces the current Demo store back to the official snapshot', () => {
  const topic = DEMO_TOPICS[1];
  if (!topic) throw new Error('Demo reset test requires a second topic.');
  const pathname = canonicalDemoPath(topic.slug);
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
  expect(state.activeNodeId).toBe(`demo-${topic.slug}`);
  expect(state.nodesById[`demo-${topic.slug}`]).toMatchObject({
    bodyStatus: 'ready',
    hasContent: true,
    parentNodeId: DEMO_GUIDES_NODE_ID,
    title: topic.title
  });
  expect(state.nodesById[DEMO_GUIDES_NODE_ID]).toMatchObject({ kind: 'folder', title: 'Guides' });
  expect(payload.state.activeNodeId).toBe(`demo-${topic.slug}`);
  expect(storage.get(DEMO_SNAPSHOT_VERSION)).toBe(DEMO_CAPTURED_VERSION);
  vi.unstubAllGlobals();
});

it('resets Demo learning state back to the official seed', () => {
  const topic = DEMO_TOPICS[0];
  const item = topic?.reviewItems[0];
  const schedule = topic?.reviewScheduleSeeds[0];
  if (!topic || !item || !schedule) throw new Error('Demo reset test requires a topic with review items.');
  const pathname = canonicalDemoPath(topic.slug);
  const topicNodeId = `demo-${topic.slug}`;
  const itemNodeId = `demo-${item.id}`;
  const storage = new Map<string, string>();
  stubDemoStorage(storage, pathname);
  useWorkspaceStore.setState(createPollutedDemoLearningState({ item, itemNodeId, topic, topicNodeId }));

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
  expect(state.nodesById[itemNodeId]?.review).toMatchObject({
    lapses: schedule.lapses,
    reps: schedule.reps,
    state: schedule.state
  });
  expect(payload.state.nodesById[topicNodeId].reading.state).toBe(topic.readingSeed.state);
  expect(payload.state.nodesById[itemNodeId].review.reps).toBe(schedule.reps);
  vi.unstubAllGlobals();
});

it('clears browser-local Demo state and immediately reinstalls the official snapshot', async () => {
  const topic = DEMO_TOPICS[0];
  if (!topic) throw new Error('Demo reset test requires a topic.');
  const pathname = canonicalDemoPath(topic.slug);
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
  expect(useWorkspaceStore.getState().activeNodeId).toBe(`demo-${topic.slug}`);
  expect(storage.get(DEMO_SNAPSHOT_VERSION)).toBe(DEMO_CAPTURED_VERSION);
  vi.unstubAllGlobals();
});

it('combines natural elapsed days with Demo manual day advances', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-20T00:00:00.000Z'));
  const storage = new Map<string, string>();
  stubDemoStorage(storage, canonicalDemoPath(DEMO_TOPICS[0]!.slug));
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
