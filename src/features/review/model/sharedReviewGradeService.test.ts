import { expect, it, vi } from 'vitest';

import type { ReviewSchedulerAdapter } from './reviewTypes';
import { gradeSharedFsrsReviewNode } from './sharedReviewGradeService';

function createScheduler(): ReviewSchedulerAdapter {
  return {
    grade: vi.fn(async (input) => ({
      card: {
        ...input.card,
        due: '2026-04-25T08:10:00.000Z',
        last_review: input.now,
        reps: input.card.reps + 1,
        scheduled_days: 3,
        stability: 3.4,
        state: 2
      },
      reviewed_at: input.now
    })),
    preview: vi.fn()
  };
}

function createFolderNode() {
  return {
    enableShortTerm: true,
    hasReveal: false,
    id: 'folder-1',
    kind: 'folder' as const,
    parentNodeId: null,
    review: null,
    reveal: null
  };
}

function createReviewedItemNode() {
  return {
    hasReveal: true,
    id: 'item-1',
    kind: 'item' as const,
    parentNodeId: 'folder-1',
    review: {
      difficulty: 4.2,
      due: '2026-04-22T08:00:00.000Z',
      elapsedDays: 2,
      lapses: 0,
      lastReviewAt: '2026-04-20T08:00:00.000Z',
      reps: 3,
      scheduledDays: 2,
      stability: 2.1,
      state: 2 as const
    },
    reveal: 'Expected answer'
  };
}

it('grades a FSRS node with inherited short-term settings and review log output', async () => {
  const scheduler = createScheduler();
  const result = await gradeSharedFsrsReviewNode({
    getSchedulerVersion: ({ enableShortTerm }) => `ts-fsrs@4:${enableShortTerm ? 'short' : 'default'}`,
    grade: 3,
    newDayStartsAtHour: 4,
    nodeId: 'item-1',
    nodesById: {
      'folder-1': createFolderNode(),
      'item-1': createReviewedItemNode()
    },
    now: '2026-04-22T08:10:00.000Z',
    scheduler
  });

  expect(scheduler.grade).toHaveBeenCalledWith(expect.objectContaining({ enableShortTerm: true, grade: 3 }));
  expect(result).toMatchObject({
    cardBefore: { due: '2026-04-22T08:00:00.000Z', reps: 3 },
    cardAfter: { reps: 4 },
    nextReviewProfile: {
      lastReviewAt: '2026-04-22T08:10:00.000Z',
      reps: 4
    },
    nodePatch: {
      review: {
        lastReviewAt: '2026-04-22T08:10:00.000Z',
        reps: 4
      },
      updatedAt: '2026-04-22T08:10:00.000Z'
    },
    reviewLog: {
      grade: 3,
      reviewedAt: '2026-04-22T08:10:00.000Z',
      schedulerVersion: 'ts-fsrs@4:short'
    }
  });
});

it('rejects non-FSRS nodes without calling the scheduler', async () => {
  const scheduler = createScheduler();
  const result = await gradeSharedFsrsReviewNode({
    getSchedulerVersion: () => 'ts-fsrs@4',
    grade: 3,
    newDayStartsAtHour: 4,
    nodeId: 'topic-1',
    nodesById: {
      'topic-1': {
        hasReveal: false,
        id: 'topic-1',
        kind: 'topic',
        parentNodeId: null,
        review: null,
        reveal: null
      }
    },
    now: '2026-04-22T08:10:00.000Z',
    scheduler
  });

  expect(result).toBeNull();
  expect(scheduler.grade).not.toHaveBeenCalled();
});

it('returns a host-neutral patch that desktop and companion can apply identically', async () => {
  const scheduler = createScheduler();
  const node = {
    hasReveal: true,
    id: 'item-1',
    kind: 'item' as const,
    parentNodeId: null,
    review: null,
    reveal: 'Expected answer',
    title: 'Card'
  };
  const result = await gradeSharedFsrsReviewNode({
    getSchedulerVersion: () => 'ts-fsrs@4',
    grade: 3,
    newDayStartsAtHour: 4,
    nodeId: 'item-1',
    nodesById: { 'item-1': node },
    now: '2026-04-22T08:10:00.000Z',
    scheduler
  });

  const desktopNode = { ...node, content: 'desktop', ...result?.nodePatch };
  const companionNode = { ...node, content: 'companion', ...result?.nodePatch };

  expect(desktopNode.review).toEqual(companionNode.review);
  expect(desktopNode.updatedAt).toBe(companionNode.updatedAt);
  expect(result?.reviewLog.schedulerVersion).toBe('ts-fsrs@4');
});

it('uses the configured new day start for day-based due dates', async () => {
  const scheduler = createScheduler();
  const result = await gradeSharedFsrsReviewNode({
    getSchedulerVersion: () => 'ts-fsrs@4',
    grade: 3,
    newDayStartsAtHour: 6,
    nodeId: 'item-1',
    nodesById: {
      'folder-1': createFolderNode(),
      'item-1': createReviewedItemNode()
    },
    now: '2026-04-22T08:10:00.000Z',
    scheduler
  });

  expect(new Date(result?.nextReviewProfile.due ?? '').getHours()).toBe(6);
});
