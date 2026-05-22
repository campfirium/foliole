import { beforeEach, expect, it, vi } from 'vitest';

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

it('creates a persisted reading profile when dismissing a first-time reading item', () => {
  const now = '2026-03-03T00:00:00.000Z';
  const firstTimeReadingNode = {
    ...createReadingNode('reading-1', now),
    reading: null
  };
  const harness = createSetStateHarness(createWorkspaceFixture([firstTimeReadingNode]));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  actions.startReviewSession(now);

  expect(actions.dismissReviewItem(now)).toBe(true);
  expect(harness.getState().nodesById['reading-1']?.reading).toMatchObject({
    lastHandledAt: now,
    nextAt: now,
    readingPosition: 0,
    state: 'dismissed'
  });
  expect(harness.getState().appActionHistory.undoStack).toHaveLength(1);
  expect(harness.getState().appActionHistory.undoStack[0]).toMatchObject({
    beforeReviewSession: {
      currentNodeId: 'reading-1',
      queueNodeIds: ['reading-1']
    },
    nodeId: 'reading-1',
    title: 'Dismiss Topic',
    type: 'topic.dismiss'
  });
  expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'reading-1',
      reading: expect.objectContaining({ state: 'dismissed' })
    })
  );
});

it('counts a dismissed reading topic as handled material', () => {
  const startedAt = '2026-03-03T00:00:00.000Z';
  const dismissedAt = '2026-03-03T00:02:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', startedAt), createReadingNode('reading-2', startedAt)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  actions.startReviewSession(startedAt);
  const dismissedNodeId = harness.getState().reviewSession.currentNodeId;

  expect(actions.dismissReviewItem(dismissedAt)).toBe(true);
  expect(harness.getState().nodesById[dismissedNodeId ?? '']?.reading?.state).toBe('dismissed');
  expect(harness.getState().reviewSession).toMatchObject({
    readTopicCount: 1,
    readingElapsedMs: 2 * 60 * 1000
  });
});

it('restores the dismissed review item as the current review item when undoing', () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', now), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });
  const historyActions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);

  actions.startReviewSession(now);
  const currentNodeId = harness.getState().reviewSession.currentNodeId;
  const nextNodeId = currentNodeId === 'reading-1' ? 'reading-2' : 'reading-1';
  expect(actions.dismissReviewItem(now)).toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBe(nextNodeId);

  expect(historyActions.undoWorkspaceAction('2026-03-04T00:00:00.000Z')).toBe(true);

  expect(harness.getState().activeNodeId).toBe(currentNodeId);
  expect(harness.getState().reviewSession).toMatchObject({
    currentNodeId,
    isAnswerRevealed: false,
    queueNodeIds: expect.arrayContaining(['reading-1', 'reading-2'])
  });

  expect(historyActions.redoWorkspaceAction('2026-03-05T00:00:00.000Z')).toBe(true);
  expect(harness.getState().activeNodeId).toBe(nextNodeId);
  expect(harness.getState().reviewSession).toMatchObject({
    currentNodeId: nextNodeId,
    isAnswerRevealed: false,
    queueNodeIds: [nextNodeId]
  });
});

it('does not dismiss the current review item while another topic is open', () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', now), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  actions.startReviewSession(now);
  const currentNodeId = harness.getState().reviewSession.currentNodeId;
  const otherNodeId = currentNodeId === 'reading-1' ? 'reading-2' : 'reading-1';
  harness.setState({ activeNodeId: otherNodeId });

  expect(actions.dismissReviewItem(now)).toBe(false);
  expect(harness.getState().nodesById[currentNodeId ?? '']?.reading?.state).toBe('active');
  expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
});
