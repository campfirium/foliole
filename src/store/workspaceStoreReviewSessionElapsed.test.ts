import { beforeEach, expect, it, vi } from 'vitest';

import { syncReviewGradeToRuntime } from './workspaceRuntimeSync';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
  createQaNode,
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
    syncNodeContentToRuntime: vi.fn(),
    syncReviewGradeToRuntime: vi.fn()
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(syncReviewGradeToRuntime).mockResolvedValue(undefined);
});

it('tracks review elapsed time separately from reading elapsed time', async () => {
  const startedAt = '2026-03-03T12:00:00.000Z';
  const reviewedAt = '2026-03-03T12:18:00.000Z';
  const harness = createSetStateHarness(createWorkspaceFixture([createQaNode('qa-1', startedAt)]));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  actions.startReviewSession(startedAt);
  actions.revealReviewAnswer();
  expect(await actions.gradeReviewCard(4, reviewedAt)).toBe(true);

  expect(harness.getState().reviewSession.reviewElapsedMs).toBe(18 * 60 * 1000);
  expect(harness.getState().reviewSession.readingElapsedMs).toBe(0);
});

it('tracks reading elapsed time separately from review elapsed time', () => {
  const startedAt = '2026-03-03T12:00:00.000Z';
  const completedAt = '2026-03-03T12:34:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createReadingNode('reading-1', startedAt), createReadingNode('reading-2', startedAt)])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  actions.startReviewSession(startedAt);
  expect(actions.completeReviewItem(completedAt)).toBe(true);

  expect(harness.getState().reviewSession.readingElapsedMs).toBe(34 * 60 * 1000);
  expect(harness.getState().reviewSession.reviewElapsedMs).toBe(0);
  expect(harness.getState().reviewSession.currentItemStartedAt).toBe(completedAt);
});
