import { expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

import { allocateNewItemReviewDueDates } from './newItemReviewSlots';

function localDayStartIso(year: number, monthIndex: number, day: number, hour = 4) {
  return new Date(year, monthIndex, day, hour).toISOString();
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

it('fills the lowest-load days and keeps earliest-day tie breaks', () => {
  const dates = allocateNewItemReviewDueDates({
    batchSize: 3,
    now: '2026-05-21T08:00:00.000Z',
    nodes: [
      createNode('day-1-a', localDayStartIso(2026, 4, 22)),
      createNode('day-1-b', localDayStartIso(2026, 4, 22)),
      createNode('day-2', localDayStartIso(2026, 4, 23))
    ]
  });

  expect(dates).toEqual([
    localDayStartIso(2026, 4, 24),
    localDayStartIso(2026, 4, 25),
    localDayStartIso(2026, 4, 26)
  ]);
});

it('uses the same load model for one- and two-item batches', () => {
  expect(allocateNewItemReviewDueDates({
    batchSize: 1,
    now: '2026-05-21T08:00:00.000Z',
    nodes: []
  })).toEqual([localDayStartIso(2026, 4, 22)]);

  expect(allocateNewItemReviewDueDates({
    batchSize: 2,
    now: '2026-05-21T08:00:00.000Z',
    nodes: []
  })).toEqual([
    localDayStartIso(2026, 4, 22),
    localDayStartIso(2026, 4, 23)
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

  expect(second).toEqual([localDayStartIso(2026, 4, 23)]);
});

it('ignores reading topics and review-null old items', () => {
  const topic = {
    ...createNode('topic', localDayStartIso(2026, 4, 22)),
    kind: 'topic' as const,
    reveal: null
  };

  expect(allocateNewItemReviewDueDates({
    batchSize: 1,
    now: '2026-05-21T08:00:00.000Z',
    nodes: [topic, createNode('old-review-null', null)]
  })).toEqual([localDayStartIso(2026, 4, 22)]);
});

it('uses the next configured day start when the current day has not rolled over yet', () => {
  expect(allocateNewItemReviewDueDates({
    batchSize: 1,
    now: new Date(2026, 4, 21, 2).toISOString(),
    nodes: [],
    newDayStartsAtHour: 4
  })).toEqual([localDayStartIso(2026, 4, 21)]);
});
