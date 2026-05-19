import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
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
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', now), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });
  const historyActions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  actions.startReviewSession(now);

  expect(actions.completeReviewItem(now)).toBe(true);
  expect(harness.getState().appActionHistory.undoStack[0]).toMatchObject({ title: 'Complete Topic' });
  expect(historyActions.undoWorkspaceAction('2026-03-04T00:00:00.000Z')).toBe(true);

  expect(harness.getState().activeNodeId).toBe('reading-1');
  expect(harness.getState().reviewSession).toMatchObject({
    currentNodeId: 'reading-1',
    queueNodeIds: ['reading-1', 'reading-2'],
    readTopicCount: 0
  });
  expect(harness.getState().nodesById['reading-1']?.reading).toMatchObject({
    lastHandledAt: '2026-03-02T00:00:00.000Z',
    repetitionCount: 1
  });
});

it('records postponed reading review items as the latest undo step', () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', now), createReadingNode('reading-2', now)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade: createSchedulerGradeMock(), preview: previewStub });
  const historyActions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  actions.startReviewSession(now);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));

  expect(actions.deferReviewItem()).toBe(true);
  expect(harness.getState().appActionHistory.undoStack[0]).toMatchObject({ title: 'Defer Topic' });
  expect(historyActions.undoWorkspaceAction('2026-03-04T00:00:00.000Z')).toBe(true);

  expect(harness.getState().activeNodeId).toBe('reading-1');
  expect(harness.getState().reviewSession.currentNodeId).toBe('reading-1');
});
