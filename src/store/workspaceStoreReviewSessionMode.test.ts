import { expect, it } from 'vitest';

import type { ReviewSchedulerAdapter } from '../features/review/model/reviewTypes';

import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
  createQaNode,
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

it('starts a session with review items first when the temporary mode is selected', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const fixture = {
    ...createWorkspaceFixture([
      createReadingNode('reading-1', now),
      createQaNode('qa-1', '2026-03-01T00:00:00.000Z'),
      createQaNode('qa-2', '2026-03-02T00:00:00.000Z')
    ]),
    reviewSessionMode: 'review-first' as const
  };
  const harness = createSetStateHarness(fixture);
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, schedulerStub);

  const started = actions.startReviewSession(now);

  expect(started).toBe(true);
  expect(harness.getState().reviewSession.queueNodeIds).toEqual(['qa-1', 'qa-2', 'reading-1']);
});

it('rebuilds the active session for reading-only and preserves completed count semantics', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const fixture = {
    ...createWorkspaceFixture([
      createQaNode('qa-1', '2026-03-01T00:00:00.000Z'),
      createReadingNode('reading-1', now)
    ]),
    reviewSession: {
      currentNodeId: 'qa-1',
      isAnswerRevealed: true,
      queueNodeIds: ['qa-1', 'reading-1'],
      totalNodeCount: 4
    }
  };
  const harness = createSetStateHarness(fixture);
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, schedulerStub);

  actions.setReviewSessionMode('reading-only', now);

  expect(harness.getState().reviewSessionMode).toBe('reading-only');
  expect(harness.getState().reviewSession).toMatchObject({
    currentNodeId: 'reading-1',
    isAnswerRevealed: false,
    queueNodeIds: ['reading-1'],
    totalNodeCount: 3
  });
  expect(harness.getState().activeNodeId).toBe('reading-1');
});
