import { beforeEach, expect, it, vi } from 'vitest';

import { syncNodeContentToRuntimeNow } from './workspaceRuntimeSync';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
  createReadingNode,
  createSchedulerGradeMock,
  createSetStateHarness,
  createWorkspaceFixture,
  previewStub
} from './workspaceStoreReviewActions.test-support';

vi.mock('./workspaceRuntimeSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspaceRuntimeSync')>();
  return {
    ...actual,
    syncNodeContentToRuntimeNow: vi.fn(async () => true)
  };
});

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

  expect(syncNodeContentToRuntimeNow).toHaveBeenCalledTimes(1);
  expect(harness.getState().nodesById[topic.id]?.reading).toMatchObject({
    nextAt: '2026-03-17T00:00:00.000Z',
    state: 'active'
  });
  expect(harness.getState().reviewSession.currentNodeId).toBeNull();
});

it('postpones a topic by changing only next due time in week steps', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });
  actions.startReviewSession(now);
  const firstNodeId = harness.getState().reviewSession.currentNodeId!;
  const beforeReading = harness.getState().nodesById[firstNodeId]?.reading;

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
  expect(harness.getState().appActionHistory.undoStack[0]).toMatchObject({ title: 'Postpone Topic' });
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
  vi.mocked(syncNodeContentToRuntimeNow).mockResolvedValueOnce(false);
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

  expect(syncNodeContentToRuntimeNow).not.toHaveBeenCalled();
  expect(harness.getState().nodesById[topic.id]?.reading?.state).toBe('dismissed');
});
