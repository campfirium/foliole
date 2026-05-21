import { expect, it } from 'vitest';

import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
  createQaNode,
  createReadingNode,
  createSchedulerGradeMock,
  createSetStateHarness,
  createWorkspaceFixture,
  previewStub
} from './workspaceStoreReviewActions.test-support';

it('shows a completed checkpoint after the last review card before reading topics', async () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    {
      ...createWorkspaceFixture([createQaNode('qa-1', now), createReadingNode('reading-1', now)]),
      reviewSessionMode: 'review-first'
    }
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  actions.startReviewSession(now);
  actions.revealReviewAnswer();
  const graded = await actions.gradeReviewCard(3, '2026-03-03T00:04:00.000Z');

  expect(graded).toBe(true);
  expect(harness.getState().reviewSession).toMatchObject({
    completedAt: '2026-03-03T00:04:00.000Z',
    continueNodeId: 'reading-1',
    currentNodeId: null,
    isAnswerRevealed: false,
    queueNodeIds: [],
    readTopicCount: 0,
    reviewedItemCount: 1,
    sessionStartedAt: now,
    totalNodeCount: 1
  });
  expect(harness.getState().activeNodeId).toBe('reading-1');
});

it('keeps a completed session checkpoint after reading the last topic', () => {
  const now = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(createWorkspaceFixture([createReadingNode('reading-1', now)]));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
    grade: createSchedulerGradeMock(),
    preview: previewStub
  });

  actions.startReviewSession(now);
  const completed = actions.completeReviewItem('2026-03-03T00:05:00.000Z');

  expect(completed).toBe(true);
  expect(harness.getState().reviewSession).toMatchObject({
    completedAt: '2026-03-03T00:05:00.000Z',
    currentNodeId: null,
    isAnswerRevealed: false,
    queueNodeIds: [],
    readTopicCount: 1,
    reviewedItemCount: 0,
    sessionStartedAt: now,
    totalNodeCount: 1
  });
});
