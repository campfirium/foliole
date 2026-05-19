import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewSessionState } from '../../store/workspaceStore';

import { resolveResumeReviewNodeId } from './useResumeReviewItem';

function createSession(overrides: Partial<ReviewSessionState> = {}): ReviewSessionState {
  return {
    completedAt: null,
    continueNodeId: null,
    currentNodeId: 'review-1',
    isAnswerRevealed: false,
    queueNodeIds: ['review-1', 'review-2'],
    readTopicCount: 0,
    reviewedItemCount: 0,
    sessionStartedAt: '2026-05-19T00:00:00.000Z',
    totalNodeCount: 2,
    ...overrides
  };
}

function createNodeRecord(nodeIds: string[]) {
  return Object.fromEntries(nodeIds.map((nodeId) => [nodeId, { id: nodeId } as Node]));
}

it('uses the current review node when it is still queued and live', () => {
  expect(
    resolveResumeReviewNodeId({
      nodesById: createNodeRecord(['review-1', 'review-2']),
      queueNodeIds: ['review-1', 'review-2'],
      reviewSession: createSession(),
      trashedNodeIds: []
    })
  ).toBe('review-1');
});

it('falls back to the queue head when persisted current review node is stale', () => {
  expect(
    resolveResumeReviewNodeId({
      nodesById: createNodeRecord(['review-2']),
      queueNodeIds: ['review-2'],
      reviewSession: createSession({
        currentNodeId: 'stale-review',
        queueNodeIds: ['review-2']
      }),
      trashedNodeIds: []
    })
  ).toBe('review-2');
});

it('skips trashed queued nodes when resuming a stale review item', () => {
  expect(
    resolveResumeReviewNodeId({
      nodesById: createNodeRecord(['review-1', 'review-2']),
      queueNodeIds: ['review-1', 'review-2'],
      reviewSession: createSession({
        currentNodeId: 'stale-review',
        queueNodeIds: ['review-1', 'review-2']
      }),
      trashedNodeIds: ['review-1']
    })
  ).toBe('review-2');
});

it('prefers the displayed review queue over a persisted session current item', () => {
  expect(
    resolveResumeReviewNodeId({
      nodesById: createNodeRecord(['panel-1', 'review-1']),
      queueNodeIds: ['panel-1'],
      reviewSession: createSession({ currentNodeId: 'review-1' }),
      trashedNodeIds: []
    })
  ).toBe('panel-1');
});
