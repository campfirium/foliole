import { expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

import { mergeHydratedNode, mergeNodeOpenStateById, mergeUntitledSequenceByParent } from './workspaceHydrateObjectMerge';

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

it('returns the current open-state record itself when no incoming open time is newer', () => {
  const current = {
    a: { nodeId: 'a', lastOpenedAt: '2026-11-02T00:00:00.000Z' },
    b: { nodeId: 'b', lastOpenedAt: '2026-11-03T00:00:00.000Z' }
  };
  expect(mergeNodeOpenStateById(current, undefined)).toBe(current);
  expect(mergeNodeOpenStateById(current, {})).toBe(current);
  expect(mergeNodeOpenStateById(current, {
    a: { nodeId: 'a', lastOpenedAt: '2026-11-02T00:00:00.000Z' },
    b: { nodeId: 'b', lastOpenedAt: '2026-11-01T00:00:00.000Z' },
    c: undefined
  })).toBe(current);
});

it('returns a new open-state record holding only the newer or added entries when one changes', () => {
  const current = {
    a: { nodeId: 'a', lastOpenedAt: '2026-11-02T00:00:00.000Z' },
    b: { nodeId: 'b', lastOpenedAt: '2026-11-03T00:00:00.000Z' }
  };
  const newerA = { nodeId: 'a', lastOpenedAt: '2026-11-04T00:00:00.000Z' };
  const addedC = { nodeId: 'c', lastOpenedAt: '2026-11-01T00:00:00.000Z' };
  const merged = mergeNodeOpenStateById(current, {
    a: newerA,
    b: { nodeId: 'b', lastOpenedAt: '2026-11-01T00:00:00.000Z' },
    c: addedC
  });
  expect(merged).not.toBe(current);
  expect(merged).toEqual({ a: newerA, b: current.b, c: addedC });
  expect(merged.b).toBe(current.b);
  expect(current.a.lastOpenedAt).toBe('2026-11-02T00:00:00.000Z');
});

it('returns the current untitled counters itself unless an incoming counter differs', () => {
  const current = { root: 2, folder: 1 };
  expect(mergeUntitledSequenceByParent(current, undefined)).toBe(current);
  expect(mergeUntitledSequenceByParent(current, { root: 2 })).toBe(current);
  const merged = mergeUntitledSequenceByParent(current, { root: 3, topic: 1 });
  expect(merged).not.toBe(current);
  expect(merged).toEqual({ root: 3, folder: 1, topic: 1 });
});
