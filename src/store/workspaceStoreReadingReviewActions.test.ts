import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { saveNodeReadingStateToRuntime } from '../shared/platform/runtime/nodeReadingStateRuntimeRepository';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

it('undoes and redoes Read with its reading and review context', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const firstDue = '2026-03-02T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', firstDue), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });
  const historyActions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  actions.startReviewSession(now);
  const before = harness.getState();
  const nodeId = before.reviewSession.currentNodeId!;
  await expect(actions.readReviewTopic(now)).resolves.toBe(true);
  const entry = harness.getState().appActionHistory.undoStack.at(-1)!;
  expect(entry).toMatchObject({ nodeId, title: 'Read Topic', type: 'topic.dismiss' });
  expect(historyActions.undoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.redoStack).toHaveLength(1));
  expect(harness.getState().nodesById[nodeId]?.reading).toEqual(before.nodesById[nodeId]?.reading);
  expect(harness.getState().reviewSession).toEqual(before.reviewSession);
  expect(historyActions.redoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.undoStack.at(-1)?.id).toBe(entry.id));
});

it('adds Later to the same workspace timeline', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const firstDue = '2026-03-02T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', firstDue), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });
  const historyActions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  actions.startReviewSession(now);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));

  await expect(actions.postponeReviewTopic()).resolves.toBe(true);
  expect(harness.getState().appActionHistory.undoStack.at(-1)).toMatchObject({
    title: 'Later Topic',
    type: 'topic.dismiss'
  });
  expect(historyActions.undoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.redoStack).toHaveLength(1));
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

  await expect(actions.revisitReviewTopicSoon(now)).resolves.toBe(true);
  await expect(actions.revisitReviewTopicSoon(now)).resolves.toBe(true);

  expect(harness.getState().appActionHistory.undoStack.slice(-2).map(({ title }) => title))
    .toEqual(['Soon Topic', 'Soon Topic']);
  expect(harness.getState().reviewSession.currentNodeId).toBe(thirdNodeId);
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([thirdNodeId]);
  expect(harness.getState().reviewSession.readTopicCount).toBe(2);
  expect(harness.getState().nodesById[firstNodeId]?.reading).toMatchObject({
    nextAt: firstReadingBeforeSoon?.nextAt,
    repetitionCount: firstReadingBeforeSoon?.repetitionCount
  });

  await expect(actions.readReviewTopic(now)).resolves.toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBe(firstNodeId);
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([]);
  expect(harness.getState().reviewSession.readTopicCount).toBe(3);

  await expect(actions.readReviewTopic(now)).resolves.toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBe(secondNodeId);
  expect(harness.getState().reviewSession.readTopicCount).toBe(3);

  await expect(actions.readReviewTopic(now)).resolves.toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBeNull();
  expect(harness.getState().reviewSession.completedAt).toBe(now);
  expect(harness.getState().reviewSession.soonNodeIds).toEqual([]);
});

it('reads topics without showing grading and advances the queue', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });

  expect(actions.startReviewSession(now)).toBe(true);
  const firstNodeId = harness.getState().reviewSession.currentNodeId!;
  const modifiedAtBeforeRead = harness.getState().nodesById[firstNodeId]?.updatedAt;
  const secondNodeId = harness.getState().reviewSession.queueNodeIds.find((nodeId) => nodeId !== firstNodeId)!;
  await expect(actions.readReviewTopic(now)).resolves.toBe(true);

  expect(harness.getState().activeNodeId).toBe(secondNodeId);
  expect(harness.getState().reviewSession.currentNodeId).toBe(secondNodeId);
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([secondNodeId]);
  expect(harness.getState().reviewSession.readTopicCount).toBe(1);
  expect(harness.getState().nodesById[firstNodeId]?.reading).toMatchObject({
    lastHandledAt: now,
    repetitionCount: 2
  });
  expect(harness.getState().nodesById[firstNodeId]?.updatedAt).toBe(modifiedAtBeforeRead);
});

it('does not advance reading items when persistence fails', async () => {
  vi.mocked(saveNodeReadingStateToRuntime).mockResolvedValueOnce(false);
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });

  actions.startReviewSession(now);
  const firstNodeId = harness.getState().reviewSession.currentNodeId!;
  await expect(actions.readReviewTopic(now)).resolves.toBe(false);

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
  vi.mocked(saveNodeReadingStateToRuntime).mockReturnValueOnce(new Promise((resolve) => {
    pendingPersist.release = () => resolve(true);
  }));
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });

  actions.startReviewSession(now);
  const first = actions.readReviewTopic(now);
  await expect(actions.readReviewTopic(now)).resolves.toBe(false);
  pendingPersist.release?.();
  await expect(first).resolves.toBe(true);

  expect(saveNodeReadingStateToRuntime).toHaveBeenCalledTimes(1);
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
  const deferred = await actions.postponeReviewTopic();
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

it('does not read or postpone topics while another topic is open', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });

  actions.startReviewSession(now);
  const firstNodeId = harness.getState().reviewSession.currentNodeId!;
  const secondNodeId = harness.getState().reviewSession.queueNodeIds.find((nodeId) => nodeId !== firstNodeId)!;
  harness.setState({ activeNodeId: secondNodeId });

  await expect(actions.readReviewTopic(now)).resolves.toBe(false);
  await expect(actions.postponeReviewTopic()).resolves.toBe(false);
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
  await expect(actions.dismissReviewTopic(now)).resolves.toBe(true);

  expect(harness.getState().activeNodeId).toBe(secondNodeId);
  expect(harness.getState().reviewSession.currentNodeId).toBe(secondNodeId);
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([secondNodeId]);
  expect(harness.getState().nodesById[firstNodeId]?.reading?.state).toBe('dismissed');
  expect(saveNodeReadingStateToRuntime).toHaveBeenCalledWith(
    expect.objectContaining({
      nodeId: firstNodeId,
      reading: expect.objectContaining({ state: 'dismissed' })
    })
  );
});
