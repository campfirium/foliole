import { describe, expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

import { allocateNewItemReviewDueDates } from './newItemReviewSlots';

function localMidnightIso(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day).toISOString();
}

function createNode(id: string, due: string | null): Node {
  return {
    id,
    parentNodeId: null,
    kind: 'item',
    title: id,
    content: '',
    reveal: 'answer',
    review: due
      ? {
          due,
          lastReviewAt: null,
          state: 0,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0
        }
      : null,
    createdAt: '2026-05-21T08:00:00.000Z',
    updatedAt: '2026-05-21T08:00:00.000Z'
  };
}

describe('allocateNewItemReviewDueDates', () => {
  it('fills the lowest-load days and keeps earliest-day tie breaks', () => {
    const dates = allocateNewItemReviewDueDates({
      batchSize: 3,
      now: '2026-05-21T08:00:00.000Z',
      nodes: [
        createNode('day-1-a', localMidnightIso(2026, 4, 22)),
        createNode('day-1-b', localMidnightIso(2026, 4, 22)),
        createNode('day-2', localMidnightIso(2026, 4, 23))
      ]
    });

    expect(dates).toEqual([
      localMidnightIso(2026, 4, 24),
      localMidnightIso(2026, 4, 25),
      localMidnightIso(2026, 4, 26)
    ]);
  });

  it('uses the same load model for one- and two-item batches', () => {
    expect(allocateNewItemReviewDueDates({
      batchSize: 1,
      now: '2026-05-21T08:00:00.000Z',
      nodes: []
    })).toEqual([localMidnightIso(2026, 4, 22)]);

    expect(allocateNewItemReviewDueDates({
      batchSize: 2,
      now: '2026-05-21T08:00:00.000Z',
      nodes: []
    })).toEqual([
      localMidnightIso(2026, 4, 22),
      localMidnightIso(2026, 4, 23)
    ]);
  });

  it('counts already assigned unreviewed new item due dates from current memory', () => {
    const first = allocateNewItemReviewDueDates({
      batchSize: 1,
      now: '2026-05-21T08:00:00.000Z',
      nodes: []
    })[0]!;

    const second = allocateNewItemReviewDueDates({
      batchSize: 1,
      now: '2026-05-21T08:00:00.000Z',
      nodes: [createNode('assigned', first)]
    });

    expect(second).toEqual([localMidnightIso(2026, 4, 23)]);
  });

  it('ignores reading topics and review-null old items', () => {
    const topic = {
      ...createNode('topic', localMidnightIso(2026, 4, 22)),
      kind: 'topic' as const,
      reveal: null
    };

    expect(allocateNewItemReviewDueDates({
      batchSize: 1,
      now: '2026-05-21T08:00:00.000Z',
      nodes: [topic, createNode('old-review-null', null)]
    })).toEqual([localMidnightIso(2026, 4, 22)]);
  });
});
