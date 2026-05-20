import { beforeEach, expect, it, vi } from 'vitest';

import { syncReviewGradeToRuntime } from './workspaceRuntimeSync';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
  createQaNode,
  createSchedulerGradeMock,
  createSetStateHarness,
  createWorkspaceFixture,
  previewStub
} from './workspaceStoreReviewActions.test-support';

vi.mock('./workspaceRuntimeSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspaceRuntimeSync')>();
  return {
    ...actual,
    syncReviewGradeToRuntime: vi.fn()
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(syncReviewGradeToRuntime).mockResolvedValue(undefined);
});

it('skips stale future FSRS cards instead of writing another grade', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const future = '2026-03-10T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createQaNode('qa-future', future), createQaNode('qa-due', now)])
  );
  const grade = createSchedulerGradeMock();
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade, preview: previewStub });

  harness.setState({
    activeNodeId: 'qa-future',
    reviewSession: {
      currentNodeId: 'qa-future',
      isAnswerRevealed: true,
      queueNodeIds: ['qa-future', 'qa-due'],
      totalNodeCount: 2
    }
  });

  await expect(actions.gradeReviewCard(3, now)).resolves.toBe(true);

  expect(grade).not.toHaveBeenCalled();
  expect(syncReviewGradeToRuntime).not.toHaveBeenCalled();
  expect(harness.getState().activeNodeId).toBe('qa-due');
  expect(harness.getState().reviewSession.currentNodeId).toBe('qa-due');
  expect(harness.getState().reviewSession.queueNodeIds).toEqual(['qa-due']);
  expect(harness.getState().nodesById['qa-future']?.review?.due).toBe(future);
});
