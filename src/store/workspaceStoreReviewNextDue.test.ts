import { expect, it, vi } from 'vitest';

import { syncReviewGradeToRuntime } from './workspaceRuntimeSync';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
  createQaNode,
  createSetStateHarness,
  createWorkspaceFixture,
  previewStub
} from './workspaceStoreReviewActions.test-support';

vi.mock('./workspaceRuntimeSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspaceRuntimeSync')>();
  return {
    ...actual,
    syncReviewGradeToRuntime: vi.fn(async () => undefined)
  };
});

function gradeResult(due: string, reviewedAt: string, scheduledDays: number) {
  return {
    card: {
      difficulty: 4,
      due,
      elapsed_days: 0,
      lapses: 0,
      last_review: reviewedAt,
      reps: 1,
      scheduled_days: scheduledDays,
      stability: 3,
      state: 1 as const
    },
    reviewed_at: reviewedAt
  };
}

it('keeps the earliest next review due across graded session items', async () => {
  const due = '2026-03-03T00:00:00.000Z';
  vi.mocked(syncReviewGradeToRuntime).mockResolvedValue(undefined);
  const harness = createSetStateHarness(
    createWorkspaceFixture([createQaNode('qa-1', due), createQaNode('qa-2', due)])
  );
  const grade = vi
    .fn()
    .mockResolvedValueOnce(gradeResult('2026-03-20T00:00:00.000Z', due, 17))
    .mockResolvedValueOnce(gradeResult('2026-03-08T00:00:00.000Z', due, 5));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade, preview: previewStub });

  actions.startReviewSession(due);
  actions.revealReviewAnswer();
  await expect(actions.gradeReviewCard(3, due)).resolves.toBe(true);
  actions.revealReviewAnswer();
  await expect(actions.gradeReviewCard(3, due)).resolves.toBe(true);

  expect(harness.getState().reviewSession).toMatchObject({
    currentNodeId: null,
    nextReviewDueAt: '2026-03-07T20:00:00.000Z',
    reviewedItemCount: 2
  });
});
