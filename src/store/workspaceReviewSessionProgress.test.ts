import { expect, it } from 'vitest';

import { resolveReviewSessionProgress } from './workspaceReviewSessionProgress';
import type { WorkspaceState } from './workspaceStore';

function createReviewSession(
  overrides: Partial<WorkspaceState['reviewSession']> = {}
): WorkspaceState['reviewSession'] {
  return {
    currentNodeId: 'qa-1',
    isAnswerRevealed: false,
    queueNodeIds: ['qa-1', 'qa-2', 'reading-1'],
    totalNodeCount: 500,
    ...overrides
  };
}

it('uses completed review facts instead of stale persisted total count', () => {
  expect(
    resolveReviewSessionProgress(
      createReviewSession({
        readTopicCount: 1,
        reviewedItemCount: 2
      })
    )
  ).toEqual({
    reviewCompletedCount: 3,
    reviewQueueCount: 3
  });
});

it('treats legacy sessions without completed counters as no completed facts', () => {
  expect(resolveReviewSessionProgress(createReviewSession())).toEqual({
    reviewCompletedCount: 0,
    reviewQueueCount: 3
  });
});

it('hides progress for non-task push sessions', () => {
  expect(resolveReviewSessionProgress(createReviewSession({ totalNodeCount: 0 }))).toEqual({
    reviewCompletedCount: 0,
    reviewQueueCount: 0
  });
});
