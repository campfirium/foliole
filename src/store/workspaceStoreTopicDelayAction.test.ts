import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { installBrowserDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowBrowserRuntime';
import { saveNodeReadingStateToRuntime } from '../shared/platform/runtime/nodeReadingStateRuntimeRepository';

import { installWorkspaceBrowserCommit } from './workspaceBrowserCommit';
import { browserFlow } from './workspaceBrowserFlow.testSupport';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
  createReadingNode,
  createSchedulerGradeMock,
  createSetStateHarness,
  createWorkspaceFixture,
  previewStub
} from './workspaceStoreReviewActions.test-support';

vi.mock('../shared/platform/runtime/nodeReadingStateRuntimeRepository', () => ({
  saveNodeReadingStateToRuntime: vi.fn(async () => true)
}));

afterEach(() => { installWorkspaceBrowserCommit(null); installBrowserDailyFlowRuntime(null); });

beforeEach(() => {
  vi.clearAllMocks();
});

it('postpones a topic outside the active review queue', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const topic = { ...createReadingNode('topic-1', now), reading: null };
  const harness = createSetStateHarness(createWorkspaceFixture([topic]));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  await expect(actions.setReviewTopicDelay(topic.id, 2, now)).resolves.toBe(true);

  expect(saveNodeReadingStateToRuntime).toHaveBeenCalledTimes(1);
  expect(harness.getState().nodesById[topic.id]?.reading).toMatchObject({
    nextAt: '2026-03-17T00:00:00.000Z',
    state: 'active'
  });
  expect(harness.getState().reviewSession.currentNodeId).toBeNull();
});

it('postpones a topic by changing only next due time in week steps', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const store = browserFlow([createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'), createReadingNode('reading-2', now)]);
  const harness = { getState: store.getState };
  const actions = store.getState();
  await actions.startReviewSession(now);
  const firstNodeId = harness.getState().reviewSession.currentNodeId!;
  const beforeReading = harness.getState().nodesById[firstNodeId]?.reading;
  const history = store.getState();

  await expect(actions.setReviewTopicDelay(firstNodeId, 4, now)).resolves.toBe(true);

  expect(harness.getState().reviewSession.readTopicCount).toBe(0);
  expect(harness.getState().reviewSession.readingElapsedMs).toBe(0);
  expect(harness.getState().nodesById[firstNodeId]?.reading).toMatchObject({
    intervalDurationMs: beforeReading?.intervalDurationMs,
    intervalGrowthFactor: beforeReading?.intervalGrowthFactor,
    lastHandledAt: beforeReading?.lastHandledAt,
    nextAt: '2026-03-31T00:00:00.000Z',
    repetitionCount: beforeReading?.repetitionCount
  });
  expect(harness.getState().appActionHistory.undoStack.at(-1)).toMatchObject({
    nodeId: firstNodeId,
    title: 'Postpone Topic'
  });
  expect(await history.undoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().nodesById[firstNodeId]?.reading).toEqual(beforeReading));
});

it('resets topic postpone level zero to the current natural due time without moving into the past', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(createWorkspaceFixture([createReadingNode('reading-1', '2026-04-02T00:00:00.000Z')]));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });
  const nodeId = harness.getState().activeNodeId!;

  await expect(actions.setReviewTopicDelay(nodeId, 0, now)).resolves.toBe(true);

  expect(harness.getState().nodesById[nodeId]?.reading).toMatchObject({
    lastHandledAt: '2026-03-02T00:00:00.000Z',
    nextAt: now,
    repetitionCount: 1
  });
});

it('does not change topic postpone state when persistence fails', async () => {
  vi.mocked(saveNodeReadingStateToRuntime).mockResolvedValueOnce(false);
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(createWorkspaceFixture([createReadingNode('reading-1', '2026-03-02T00:00:00.000Z')]));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });
  const nodeId = harness.getState().activeNodeId!;

  await expect(actions.setReviewTopicDelay(nodeId, 7, now)).resolves.toBe(false);

  expect(harness.getState().nodesById[nodeId]?.reading?.nextAt).toBe('2026-03-02T00:00:00.000Z');
  expect(harness.getState().appActionHistory.undoStack).toHaveLength(0);
});

it('does not postpone dismissed topics', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const topic = {
    ...createReadingNode('topic-1', now),
    reading: { ...createReadingNode('topic-1', now).reading!, state: 'dismissed' as const }
  };
  const harness = createSetStateHarness(createWorkspaceFixture([topic]));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  await expect(actions.setReviewTopicDelay(topic.id, 2, now)).resolves.toBe(false);

  expect(saveNodeReadingStateToRuntime).not.toHaveBeenCalled();
  expect(harness.getState().nodesById[topic.id]?.reading?.state).toBe('dismissed');
});

it('postpones by the full day count without changing the reading history or interval', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const topic = createReadingNode('topic-1', now);
  const store = browserFlow([topic]);
  await expect(store.getState().setReviewTopicDelay(topic.id, 14, now, topic.reading, 'days')).resolves.toBe(true);
  expect(store.getState().nodesById[topic.id]?.reading).toEqual({
    ...topic.reading,
    nextAt: '2026-03-17T00:00:00.000Z'
  });
});

it('restores the natural due date after a day-based postponement is reset to zero', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const original = createReadingNode('topic-1', now);
  const reading = { ...original.reading!, intervalDurationMs: 3 * 86_400_000 };
  const topic = { ...original, reading };
  const store = browserFlow([topic]);
  await expect(store.getState().setReviewTopicDelay(topic.id, 14, now, reading, 'days')).resolves.toBe(true);
  const postponed = store.getState().nodesById[topic.id]?.reading;
  expect(postponed?.nextAt).toBe('2026-03-17T00:00:00.000Z');

  await expect(store.getState().setReviewTopicDelay(topic.id, 0, now, postponed, 'days')).resolves.toBe(true);
  expect(store.getState().nodesById[topic.id]?.reading).toEqual({
    ...reading,
    nextAt: '2026-03-05T00:00:00.000Z'
  });
});
