import { expect, it } from 'vitest';

import type { ReviewSchedulerAdapter } from '../features/review/model/reviewTypes';

import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
  createReadingNode,
  createSetStateHarness,
  createWorkspaceFixture
} from './workspaceStoreReviewActions.test-support';

const schedulerStub: ReviewSchedulerAdapter = {
  grade: async () => {
    throw new Error('grade should not be called');
  },
  preview: async () => {
    throw new Error('preview should not be called');
  }
};

it('returns from reading-only to recommended when only reading content remains', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const fixture = {
    ...createWorkspaceFixture([createReadingNode('reading-1', now)]),
    reviewSessionMode: 'reading-only' as const,
    reviewSession: {
      currentNodeId: 'reading-1',
      isAnswerRevealed: false,
      queueNodeIds: ['reading-1'],
      totalNodeCount: 1
    }
  };
  const harness = createSetStateHarness(fixture);
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, schedulerStub);

  actions.setReviewSessionMode('recommended', now);

  expect(harness.getState().reviewSessionMode).toBe('recommended');
  expect(harness.getState().reviewSession).toMatchObject({
    currentNodeId: 'reading-1',
    queueNodeIds: ['reading-1'],
    totalNodeCount: 1
  });
  expect(harness.getState().activeNodeId).toBe('reading-1');
});
