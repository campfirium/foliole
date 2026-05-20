import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewSessionState } from '../../store/workspaceStore';

import { resolveResumeReviewNodeId } from './useResumeReviewItem';

function createNodeRecord(nodeIds: string[]) {
  return Object.fromEntries(nodeIds.map((nodeId) => [nodeId, { id: nodeId } as Node]));
}

function createSession(overrides: Partial<ReviewSessionState> = {}): ReviewSessionState {
  return {
    currentNodeId: 'review-1',
    isAnswerRevealed: false,
    queueNodeIds: ['review-1', 'review-2'],
    totalNodeCount: 2,
    ...overrides
  };
}

it('uses the true review queue head when it is live', () => {
  expect(
    resolveResumeReviewNodeId({
      nodesById: createNodeRecord(['review-1', 'review-2']),
      queueNodeIds: ['review-1', 'review-2'],
      reviewSession: createSession(),
      trashedNodeIds: []
    })
  ).toBe('review-1');
});

it('falls back to the next true queue item when the head is stale', () => {
  expect(
    resolveResumeReviewNodeId({
      nodesById: createNodeRecord(['review-2']),
      queueNodeIds: ['stale-review', 'review-2'],
      reviewSession: createSession({ currentNodeId: 'stale-review' }),
      trashedNodeIds: []
    })
  ).toBe('review-2');
});

it('skips trashed queued nodes when resuming a stale review item', () => {
  expect(
    resolveResumeReviewNodeId({
      nodesById: createNodeRecord(['review-1', 'review-2']),
      queueNodeIds: ['review-1', 'review-2'],
      reviewSession: createSession({ currentNodeId: 'stale-review' }),
      trashedNodeIds: ['review-1']
    })
  ).toBe('review-2');
});

it('uses the persisted session current item when it is still in the resume queue', () => {
  expect(
    resolveResumeReviewNodeId({
      nodesById: createNodeRecord(['panel-1', 'review-1']),
      queueNodeIds: ['panel-1', 'review-1'],
      reviewSession: createSession({ currentNodeId: 'review-1' }),
      trashedNodeIds: []
    })
  ).toBe('review-1');
});

it('does not recover future fsrs cards that are absent from the true queue', () => {
  expect(
    resolveResumeReviewNodeId({
      nodesById: createNodeRecord(['review-future', 'review-due']),
      queueNodeIds: ['review-due'],
      reviewSession: createSession({ currentNodeId: 'review-future' }),
      trashedNodeIds: []
    })
  ).toBe('review-due');
});
