import { expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

import { mergeHydratedNode } from './workspaceHydrateObjectMerge';

function createNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'node-1',
    parentNodeId: null,
    kind: 'topic',
    title: 'Node',
    isTitleManual: true,
    hideTitleHeading: false,
    content: '',
    reveal: null,
    reading: null,
    review: null,
    createdAt: '2026-04-02T00:00:00.000Z',
    updatedAt: '2026-04-02T00:00:00.000Z',
    ...overrides
  };
}

it('keeps a newer renderer review profile when hydrate brings an older snapshot', () => {
  const staleReview = {
    due: '2026-04-02T00:00:00.000Z',
    lastReviewAt: null,
    state: 0 as const,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0
  };
  const gradedReview = {
    due: '2026-04-05T00:10:00.000Z',
    lastReviewAt: '2026-04-02T00:10:00.000Z',
    state: 1 as const,
    stability: 1.5,
    difficulty: 2.1,
    elapsedDays: 0,
    scheduledDays: 3,
    reps: 1,
    lapses: 0
  };

  expect(mergeHydratedNode(createNode({ review: gradedReview }), createNode({ review: staleReview })).review)
    .toEqual(gradedReview);
});

it('still accepts a newer runtime review profile for the same node', () => {
  const currentReview = {
    due: '2026-04-05T00:10:00.000Z',
    lastReviewAt: '2026-04-02T00:10:00.000Z',
    state: 1 as const,
    stability: 1.5,
    difficulty: 2.1,
    elapsedDays: 0,
    scheduledDays: 3,
    reps: 1,
    lapses: 0
  };
  const runtimeReview = {
    ...currentReview,
    due: '2026-04-09T00:20:00.000Z',
    lastReviewAt: '2026-04-03T00:20:00.000Z',
    reps: 2
  };

  expect(mergeHydratedNode(createNode({ review: currentReview }), createNode({ review: runtimeReview })).review)
    .toEqual(runtimeReview);
});
