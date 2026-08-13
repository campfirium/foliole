import { beforeEach, expect, it, vi } from 'vitest';

import { saveNodeReadingStateToRuntime } from '../shared/platform/runtime/nodeReadingStateRuntimeRepository';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { createStartedReviewSession } from './workspaceReviewReading';
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

it('creates a persisted reading profile when dismissing a first-time reading item', async () => {
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

  await expect(actions.dismissReviewTopic(now)).resolves.toBe(true);
  expect(harness.getState().nodesById['reading-1']?.reading).toMatchObject({
    lastHandledAt: now,
    nextAt: now,
    readingPosition: 0,
    state: 'dismissed'
  });
  expect(harness.getState().appActionHistory.undoStack).toEqual([]);
  expect(saveNodeReadingStateToRuntime).toHaveBeenCalledWith(
    expect.objectContaining({
      nodeId: 'reading-1',
      reading: expect.objectContaining({ state: 'dismissed' })
    })
  );
});

it('counts a dismissed reading topic as handled material', async () => {
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

  await expect(actions.dismissReviewTopic(dismissedAt)).resolves.toBe(true);
  expect(harness.getState().nodesById[dismissedNodeId ?? '']?.reading?.state).toBe('dismissed');
  expect(harness.getState().reviewSession).toMatchObject({
    readTopicCount: 1,
    readingElapsedMs: 2 * 60 * 1000
  });
});

it('does not route dismissed review items through workspace undo', async () => {
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
  await expect(actions.dismissReviewTopic(now)).resolves.toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBe(nextNodeId);

  expect(historyActions.undoWorkspaceAction()).toBe(false);
  expect(harness.getState().activeNodeId).toBe(nextNodeId);
  expect(harness.getState().appActionHistory.undoStack).toEqual([]);
});

it('does not dismiss the current review item while another topic is open', async () => {
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

  await expect(actions.dismissReviewTopic(now)).resolves.toBe(false);
  expect(harness.getState().nodesById[currentNodeId ?? '']?.reading?.state).toBe('active');
  expect(saveNodeReadingStateToRuntime).not.toHaveBeenCalled();
});

it('continues within the same sequential book after dismissing its cover topic', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const books = {
    ...createReadingNode('books', now),
    content: '',
    kind: 'folder' as const,
    reading: null,
    sequentialReadingEnabled: true
  };
  const debugging = { ...createReadingNode('debugging', now), parentNodeId: 'books', title: 'Debugging' };
  const copyright = {
    ...createReadingNode('copyright', now),
    parentNodeId: 'debugging',
    title: 'Copyright'
  };
  const drucker = {
    ...createReadingNode('drucker', now),
    parentNodeId: 'books',
    reading: { ...createReadingNode('drucker', now).reading!, state: 'locked' as const },
    title: 'Drucker'
  };
  const harness = createSetStateHarness(createWorkspaceFixture([books, debugging, copyright, drucker]));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  harness.setState({
    activeNodeId: 'debugging',
    reviewSession: createStartedReviewSession({
      continueNodeId: 'books',
      currentNodeId: 'debugging',
      queueNodeIds: ['debugging', 'copyright'],
      sessionStartedAt: now,
      totalNodeCount: 2
    })
  });
  expect(harness.getState().reviewSession.currentNodeId).toBe('debugging');

  await expect(actions.dismissReviewTopic(now)).resolves.toBe(true);

  expect(harness.getState().reviewSession.currentNodeId).toBe('copyright');
  expect(harness.getState().nodesById.drucker?.reading?.state).toBe('locked');
  expect(harness.getState().appActionHistory.undoStack).toEqual([]);
});
