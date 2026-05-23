import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
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
    syncNodeContentToRuntime: vi.fn()
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

it('undoes a completed reading review item back to the previous session step', () => {
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

  expect(actions.completeReviewItem(now)).toBe(true);
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

it('records postponed reading review items as the latest undo step', () => {
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

  expect(actions.deferReviewItem()).toBe(true);
  expect(harness.getState().appActionHistory.undoStack[0]).toMatchObject({ title: 'Defer Topic' });
  expect(historyActions.undoWorkspaceAction('2026-03-04T00:00:00.000Z')).toBe(true);

  expect(harness.getState().activeNodeId).toBe(firstNodeId);
  expect(harness.getState().reviewSession.currentNodeId).toBe(firstNodeId);
});

it('replays soon reading topics after the current queue in click order without rescheduling them', () => {
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

  expect(actions.soonReviewItem(now)).toBe(true);
  expect(actions.soonReviewItem(now)).toBe(true);

  expect(harness.getState().reviewSession.currentNodeId).toBe(thirdNodeId);
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([thirdNodeId]);
  expect(harness.getState().reviewSession.readTopicCount).toBe(2);
  expect(harness.getState().nodesById[firstNodeId]?.reading).toMatchObject({
    nextAt: firstReadingBeforeSoon?.nextAt,
    repetitionCount: firstReadingBeforeSoon?.repetitionCount
  });

  expect(actions.completeReviewItem(now)).toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBe(firstNodeId);
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([]);
  expect(harness.getState().reviewSession.readTopicCount).toBe(3);

  expect(actions.completeReviewItem(now)).toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBe(secondNodeId);
  expect(harness.getState().reviewSession.readTopicCount).toBe(3);
});

it('completes reading items without showing grading and advances the queue', () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });

  expect(actions.startReviewSession(now)).toBe(true);
  const firstNodeId = harness.getState().reviewSession.currentNodeId!;
  const secondNodeId = harness.getState().reviewSession.queueNodeIds.find((nodeId) => nodeId !== firstNodeId)!;
  expect(actions.completeReviewItem(now)).toBe(true);

  expect(harness.getState().activeNodeId).toBe(secondNodeId);
  expect(harness.getState().reviewSession.currentNodeId).toBe(secondNodeId);
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([secondNodeId]);
  expect(harness.getState().reviewSession.readTopicCount).toBe(1);
  expect(harness.getState().nodesById[firstNodeId]?.reading).toMatchObject({
    lastHandledAt: now,
    repetitionCount: 2
  });
});

it('postpones reading items with a shorter interval and removes them from the current queue', () => {
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
  const deferred = actions.deferReviewItem();
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

it('does not complete or postpone reading while another topic is open', () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });

  actions.startReviewSession(now);
  const firstNodeId = harness.getState().reviewSession.currentNodeId!;
  const secondNodeId = harness.getState().reviewSession.queueNodeIds.find((nodeId) => nodeId !== firstNodeId)!;
  harness.setState({ activeNodeId: secondNodeId });

  expect(actions.completeReviewItem(now)).toBe(false);
  expect(actions.deferReviewItem()).toBe(false);
  expect(harness.getState().reviewSession.currentNodeId).toBe(firstNodeId);
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([firstNodeId, secondNodeId]);
});

it('dismisses reading items and removes them from future queues', () => {
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
  expect(actions.dismissReviewItem(now)).toBe(true);

  expect(harness.getState().activeNodeId).toBe(secondNodeId);
  expect(harness.getState().reviewSession.currentNodeId).toBe(secondNodeId);
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([secondNodeId]);
  expect(harness.getState().nodesById[firstNodeId]?.reading?.state).toBe('dismissed');
  expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
    expect.objectContaining({
      id: firstNodeId,
      reading: expect.objectContaining({ state: 'dismissed' })
    })
  );
});
