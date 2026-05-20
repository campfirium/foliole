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
  expect(harness.getState().reviewSession.queueNodeIds).toEqual(['qa-1', 'qa-2']);
});

it('rebuilds the active session for reading-only without carrying stale total count', () => {
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
    totalNodeCount: 1
  });
  expect(harness.getState().activeNodeId).toBe('reading-1');
});

it('keeps a completed checkpoint when changing temporary mode after the queue is clear', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const fixture = {
    ...createWorkspaceFixture([createReadingNode('reading-1', now)]),
    reviewSession: {
      completedAt: now,
      continueNodeId: 'reading-1',
      currentNodeId: null,
      isAnswerRevealed: false,
      queueNodeIds: [],
      readTopicCount: 1,
      reviewedItemCount: 0,
      sessionStartedAt: '2026-03-10T11:58:00.000Z',
      totalNodeCount: 1
    }
  };
  const harness = createSetStateHarness(fixture);
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, schedulerStub);

  actions.setReviewSessionMode('reading-only', now);

  expect(harness.getState().reviewSessionMode).toBe('reading-only');
  expect(harness.getState().reviewSession).toMatchObject({
    completedAt: now,
    currentNodeId: null,
    queueNodeIds: [],
    totalNodeCount: 1
  });
});

it('does not resume future scheduled cards when the active session has no queued item', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const future = '2026-03-12T12:00:00.000Z';
  const fixture = {
    ...createWorkspaceFixture([createQaNode('qa-future', future)]),
    activeNodeId: 'qa-future',
    reviewSession: {
      currentNodeId: null,
      isAnswerRevealed: false,
      queueNodeIds: [],
      totalNodeCount: 0
    }
  };
  const harness = createSetStateHarness(fixture);
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, schedulerStub);

  const resumed = actions.resumeReviewSession(now);

  expect(resumed).toBe(false);
  expect(harness.getState().reviewSession).toMatchObject({
    currentNodeId: null,
    isAnswerRevealed: false,
    queueNodeIds: [],
    totalNodeCount: 0
  });
  expect(harness.getState().activeNodeId).toBe('qa-future');
});

it('resumes the remaining active session queue without rebuilding from scheduled cards', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const future = '2026-03-12T12:00:00.000Z';
  const fixture = {
    ...createWorkspaceFixture([
      createQaNode('qa-future', future),
      createQaNode('qa-remaining', '2026-03-01T00:00:00.000Z')
    ]),
    activeNodeId: 'qa-future',
    reviewSession: {
      currentNodeId: null,
      isAnswerRevealed: false,
      queueNodeIds: ['qa-remaining'],
      totalNodeCount: 2
    }
  };
  const harness = createSetStateHarness(fixture);
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, schedulerStub);

  const resumed = actions.resumeReviewSession(now);

  expect(resumed).toBe(true);
  expect(harness.getState().reviewSession).toMatchObject({
    currentNodeId: 'qa-remaining',
    isAnswerRevealed: false,
    queueNodeIds: ['qa-remaining'],
    totalNodeCount: 1
  });
  expect(harness.getState().activeNodeId).toBe('qa-remaining');
});

it('reorders a persisted reading queue by material source before resuming', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const sourceA = Array.from({ length: 6 }, (_, index) => ({
    ...createReadingNode(`a-${index + 1}`, now),
    parentNodeId: 'source-a'
  }));
  const sourceB = Array.from({ length: 4 }, (_, index) => ({
    ...createReadingNode(`b-${index + 1}`, now),
    parentNodeId: 'source-b'
  }));
  const fixture = {
    ...createWorkspaceFixture([...sourceA, ...sourceB]),
    reviewSession: {
      currentNodeId: null,
      isAnswerRevealed: false,
      queueNodeIds: [...sourceA, ...sourceB].map((node) => node.id),
      totalNodeCount: 10
    }
  };
  const harness = createSetStateHarness(fixture);
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, schedulerStub);

  expect(actions.resumeReviewSession(now)).toBe(true);

  expect(harness.getState().reviewSession.queueNodeIds).toEqual([
    'a-1',
    'b-1',
    'a-6',
    'b-4',
    'a-5',
    'b-3',
    'a-4',
    'b-2',
    'a-3',
    'a-2'
  ]);
  expect(harness.getState().activeNodeId).toBe('a-1');
});

it('skips future cards that linger in a persisted review session queue', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const fixture = {
    ...createWorkspaceFixture([
      createQaNode('qa-future', '2026-03-12T12:00:00.000Z'),
      createQaNode('qa-due', '2026-03-01T00:00:00.000Z')
    ]),
    reviewSession: {
      currentNodeId: 'qa-future',
      isAnswerRevealed: true,
      queueNodeIds: ['qa-future', 'qa-due'],
      totalNodeCount: 2
    }
  };
  const harness = createSetStateHarness(fixture);
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, schedulerStub);

  expect(actions.resumeReviewSession(now)).toBe(true);

  expect(harness.getState().reviewSession).toMatchObject({
    currentNodeId: 'qa-due',
    isAnswerRevealed: false,
    queueNodeIds: ['qa-due'],
    totalNodeCount: 1
  });
});
