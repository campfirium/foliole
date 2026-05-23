import { beforeEach, expect, it, vi } from 'vitest';

import { syncReviewGradeToRuntime } from './workspaceRuntimeSync';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
  createClozeReviewNode,
  createQaNode,
  createSchedulerGradeMock,
  createSetStateHarness,
  createWorkspaceFixture,
  expectReviewQueueAdvanced,
  expectReviewRuntimeSyncCalled,
  previewStub
} from './workspaceStoreReviewActions.test-support';

vi.mock('./workspaceRuntimeSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspaceRuntimeSync')>();
  return {
    ...actual,
    syncNodeContentToRuntime: vi.fn(),
    syncReviewGradeToRuntime: vi.fn()
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(syncReviewGradeToRuntime).mockResolvedValue(undefined);
});

it('advances to next review node after show-answer and grade', async () => {
  const due = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createQaNode('qa-1', due), createQaNode('qa-2', due)])
  );
  const grade = createSchedulerGradeMock();
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade, preview: previewStub });

  const started = actions.startReviewSession(due);
  expect(started).toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBe('qa-1');
  expect(harness.getState().reviewSession.isAnswerRevealed).toBe(false);
  expect(harness.getState().reviewSession.sessionStartedAt).toBe(due);
  expect(harness.getState().reviewSession.continueNodeId).toBe('qa-1');

  actions.revealReviewAnswer();
  expect(harness.getState().reviewSession.isAnswerRevealed).toBe(true);

  const graded = await actions.gradeReviewCard(3, due);
  expect(graded).toBe(true);
  expect(grade).toHaveBeenCalledTimes(1);
  expectReviewRuntimeSyncCalled();
  expectReviewQueueAdvanced(harness.getState());
});

it('ends session when grading the last review node', async () => {
  const due = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(createWorkspaceFixture([createQaNode('qa-1', due)]));
  const actions = createWorkspaceReviewActions(
    harness.setState,
    harness.getState,
    {
      preview: previewStub,
      grade: async (input) => ({
        card: {
          ...input.card,
          state: 2,
          due: '2026-03-06T00:00:00.000Z',
          last_review: input.now
        },
        reviewed_at: input.now
      })
    }
  );

  actions.startReviewSession(due);
  actions.revealReviewAnswer();
  const graded = await actions.gradeReviewCard(4, due);

  expect(graded).toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBeNull();
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([]);
  expect(harness.getState().reviewSession.isAnswerRevealed).toBe(false);
  expect(harness.getState().reviewSession.completedAt).toBe(due);
  expect(harness.getState().reviewSession.reviewedItemCount).toBe(1);
  expect(harness.getState().reviewSession.readTopicCount).toBe(0);
  expect(harness.getState().reviewSession.totalNodeCount).toBe(1);
  expect(harness.getState().activeNodeId).toBe('qa-1');
});

it('treats cloze review nodes as gradable review cards', async () => {
  const due = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createClozeReviewNode('cloze-1', due), createQaNode('qa-2', due)])
  );
  const grade = createSchedulerGradeMock();
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade, preview: previewStub });

  const started = actions.startReviewSession(due);
  expect(started).toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBe('cloze-1');

  actions.revealReviewAnswer();
  const graded = await actions.gradeReviewCard(3, due);

  expect(graded).toBe(true);
  expect(grade).toHaveBeenCalledTimes(1);
  expect(syncReviewGradeToRuntime).toHaveBeenCalledWith(
    expect.objectContaining({
      nodeId: 'cloze-1',
      grade: 3
    })
  );
  expect(harness.getState().reviewSession.currentNodeId).toBe('qa-2');
});

it('persists runtime sync and advances review state in one grading action', async () => {
  const due = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createQaNode('qa-1', due), createQaNode('qa-2', due)])
  );
  const grade = createSchedulerGradeMock();
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade, preview: previewStub });

  actions.startReviewSession(due);
  actions.revealReviewAnswer();
  const graded = await actions.gradeReviewCard(3, due);

  expect(graded).toBe(true);
  expect(grade).toHaveBeenCalledTimes(1);
  expectReviewRuntimeSyncCalled();
  expectReviewQueueAdvanced(harness.getState());
});

it('keeps current review card when runtime sync fails', async () => {
  const due = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createQaNode('qa-1', due), createQaNode('qa-2', due)])
  );
  vi.mocked(syncReviewGradeToRuntime).mockRejectedValueOnce(new Error('sqlite write failed'));
  const grade = createSchedulerGradeMock();
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade, preview: previewStub });

  actions.startReviewSession(due);
  actions.revealReviewAnswer();
  const graded = await actions.gradeReviewCard(3, due);

  expect(graded).toBe(false);
  expect(grade).toHaveBeenCalledTimes(1);
  expect(syncReviewGradeToRuntime).toHaveBeenCalledTimes(1);
  expect(harness.getState().activeNodeId).toBe('qa-1');
  expect(harness.getState().reviewSession.currentNodeId).toBe('qa-1');
  expect(harness.getState().reviewSession.queueNodeIds).toEqual(['qa-1', 'qa-2']);
  expect(harness.getState().nodesById['qa-1']?.review).toMatchObject({
    due: '2026-03-03T00:00:00.000Z',
    state: 0,
    lastReviewAt: null
  });
});
