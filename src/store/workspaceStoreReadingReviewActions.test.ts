import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
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

afterEach(() => {
  vi.useRealTimers();
});

it('undoes a completed reading review item back to the previous session step', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const firstDue = '2026-03-02T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', firstDue), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });
  const historyActions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  actions.startReviewSession(now);
  const firstNodeId = harness.getState().reviewSession.currentNodeId!;
  const queueNodeIds = [...harness.getState().reviewSession.queueNodeIds];

  await expect(actions.completeReviewItem(now)).resolves.toBe(true);
  expect(harness.getState().appActionHistory.undoStack[0]).toMatchObject({ title: 'Complete Topic' });
  expect(historyActions.undoWorkspaceAction('2026-03-04T00:00:00.000Z')).toBe(true);

  expect(harness.getState().activeNodeId).toBe(firstNodeId);
  expect(harness.getState().reviewSession).toMatchObject({
    currentNodeId: firstNodeId,
    queueNodeIds,
    readTopicCount: 0
  });
  expect(harness.getState().nodesById[firstNodeId]?.reading).toMatchObject({
    lastHandledAt: '2026-03-02T00:00:00.000Z',
    repetitionCount: 1
  });
});

it('records postponed reading review items as the latest undo step', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const firstDue = '2026-03-02T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', firstDue), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });
  const historyActions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  actions.startReviewSession(now);
  const firstNodeId = harness.getState().reviewSession.currentNodeId!;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));

  await expect(actions.deferReviewItem()).resolves.toBe(true);
  expect(harness.getState().appActionHistory.undoStack[0]).toMatchObject({ title: 'Defer Topic' });
  expect(historyActions.undoWorkspaceAction('2026-03-04T00:00:00.000Z')).toBe(true);

  expect(harness.getState().activeNodeId).toBe(firstNodeId);
  expect(harness.getState().reviewSession.currentNodeId).toBe(firstNodeId);
});

it('replays soon reading topics after the current queue in click order without rescheduling them', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([
      createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'),
      createReadingNode('reading-2', '2026-03-02T01:00:00.000Z'),
      createReadingNode('reading-3', '2026-03-02T02:00:00.000Z')
    ])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });
  actions.startReviewSession(now);
  const [firstNodeId, secondNodeId, thirdNodeId] = harness.getState().reviewSession.queueNodeIds as [string, string, string];
  const firstReadingBeforeSoon = harness.getState().nodesById[firstNodeId]?.reading;

  await expect(actions.soonReviewItem(now)).resolves.toBe(true);
  await expect(actions.soonReviewItem(now)).resolves.toBe(true);

  expect(harness.getState().reviewSession.currentNodeId).toBe(thirdNodeId);
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([thirdNodeId]);
  expect(harness.getState().reviewSession.readTopicCount).toBe(2);
  expect(harness.getState().nodesById[firstNodeId]?.reading).toMatchObject({
    nextAt: firstReadingBeforeSoon?.nextAt,
    repetitionCount: firstReadingBeforeSoon?.repetitionCount
  });

  await expect(actions.completeReviewItem(now)).resolves.toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBe(firstNodeId);
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([]);
  expect(harness.getState().reviewSession.readTopicCount).toBe(3);

  await expect(actions.completeReviewItem(now)).resolves.toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBe(secondNodeId);
  expect(harness.getState().reviewSession.readTopicCount).toBe(3);
});

it('completes reading items without showing grading and advances the queue', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });

  expect(actions.startReviewSession(now)).toBe(true);
  const firstNodeId = harness.getState().reviewSession.currentNodeId!;
  const secondNodeId = harness.getState().reviewSession.queueNodeIds.find((nodeId) => nodeId !== firstNodeId)!;
  await expect(actions.completeReviewItem(now)).resolves.toBe(true);

  expect(harness.getState().activeNodeId).toBe(secondNodeId);
  expect(harness.getState().reviewSession.currentNodeId).toBe(secondNodeId);
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([secondNodeId]);
  expect(harness.getState().reviewSession.readTopicCount).toBe(1);
  expect(harness.getState().nodesById[firstNodeId]?.reading).toMatchObject({
    lastHandledAt: now,
    repetitionCount: 2
  });
});

it('does not advance reading items when persistence fails', async () => {
  vi.mocked(syncNodeContentToRuntimeNow).mockResolvedValueOnce(false);
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });

  actions.startReviewSession(now);
  const firstNodeId = harness.getState().reviewSession.currentNodeId!;
  await expect(actions.completeReviewItem(now)).resolves.toBe(false);

  expect(harness.getState().activeNodeId).toBe(firstNodeId);
  expect(harness.getState().reviewSession.currentNodeId).toBe(firstNodeId);
  expect(harness.getState().appActionHistory.undoStack).toHaveLength(0);
  expect(harness.getState().nodesById[firstNodeId]?.reading).toMatchObject({
    lastHandledAt: '2026-03-02T00:00:00.000Z',
    repetitionCount: 1
  });
});

it('ignores duplicate reading actions while persistence is in flight', async () => {
  const pendingPersist: { release?: () => void } = {};
  vi.mocked(syncNodeContentToRuntimeNow).mockReturnValueOnce(new Promise((resolve) => {
    pendingPersist.release = () => resolve(true);
  }));
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });

  actions.startReviewSession(now);
  const first = actions.completeReviewItem(now);
  await expect(actions.completeReviewItem(now)).resolves.toBe(false);
  pendingPersist.release?.();
  await expect(first).resolves.toBe(true);

  expect(syncNodeContentToRuntimeNow).toHaveBeenCalledTimes(1);
  expect(harness.getState().appActionHistory.undoStack).toHaveLength(1);
});

it('postpones reading items with a shorter interval and removes them from the current queue', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });

  actions.startReviewSession(now);
  const firstNodeId = harness.getState().reviewSession.currentNodeId!;
  const secondNodeId = harness.getState().reviewSession.queueNodeIds.find((nodeId) => nodeId !== firstNodeId)!;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  const deferred = await actions.deferReviewItem();
  vi.useRealTimers();

  expect(deferred).toBe(true);
  expect(harness.getState().activeNodeId).toBe(secondNodeId);
  expect(harness.getState().reviewSession.currentNodeId).toBe(secondNodeId);
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([secondNodeId]);
  expect(harness.getState().reviewSession.readTopicCount).toBe(1);
  expect(harness.getState().nodesById[firstNodeId]?.reading).toMatchObject({
    lastHandledAt: now,
    nextAt: '2026-03-04T03:21:51.157Z',
    repetitionCount: 2
  });
});

it('does not complete or postpone reading while another topic is open', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });

  actions.startReviewSession(now);
  const firstNodeId = harness.getState().reviewSession.currentNodeId!;
  const secondNodeId = harness.getState().reviewSession.queueNodeIds.find((nodeId) => nodeId !== firstNodeId)!;
  harness.setState({ activeNodeId: secondNodeId });

  await expect(actions.completeReviewItem(now)).resolves.toBe(false);
  await expect(actions.deferReviewItem()).resolves.toBe(false);
  expect(harness.getState().reviewSession.currentNodeId).toBe(firstNodeId);
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([firstNodeId, secondNodeId]);
});

it('dismisses reading items and removes them from future queues', async () => {
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
  const secondNodeId = harness.getState().reviewSession.queueNodeIds.find((nodeId) => nodeId !== firstNodeId)!;
  await expect(actions.dismissReviewItem(now)).resolves.toBe(true);

  expect(harness.getState().activeNodeId).toBe(secondNodeId);
  expect(harness.getState().reviewSession.currentNodeId).toBe(secondNodeId);
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([secondNodeId]);
  expect(harness.getState().nodesById[firstNodeId]?.reading?.state).toBe('dismissed');
  expect(syncNodeContentToRuntimeNow).toHaveBeenCalledWith(
    expect.objectContaining({
      id: firstNodeId,
      reading: expect.objectContaining({ state: 'dismissed' })
    })
  );
});
