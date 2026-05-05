import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { gradeCompanionReviewCard, resolveCompanionReviewSession } from './companionReviewSession';

const schedulerGrade = vi.fn();

vi.mock('../features/review/model/reviewSchedulerFactory', () => ({
  createReviewSchedulerAdapter: () => ({
    grade: schedulerGrade
  })
}));

type SnapshotNode = WorkspaceSnapshot['nodesById'][string];

function createTopicNode(overrides: Partial<SnapshotNode> = {}): SnapshotNode {
  return {
    anchorLink: null,
    content: '# Topic\n\nBody',
    createdAt: '2026-04-22T08:00:00.000Z',
    hideTitleHeading: false,
    id: 'topic-1',
    isTitleManual: false,
    kind: 'topic',
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title: 'Topic',
    updatedAt: '2026-04-22T08:00:00.000Z',
    ...overrides
  };
}

function createItemNode(overrides: Partial<SnapshotNode> = {}): SnapshotNode {
  return {
    anchorLink: null,
    content: 'Question prompt',
    createdAt: '2026-04-22T08:00:00.000Z',
    hideTitleHeading: false,
    id: 'item-1',
    isTitleManual: false,
    kind: 'item',
    parentNodeId: 'topic-1',
    reading: null,
    reveal: 'Expected answer',
    review: {
      difficulty: 4.2,
      due: '2026-04-22T08:00:00.000Z',
      elapsedDays: 2,
      lapses: 0,
      lastReviewAt: '2026-04-20T08:00:00.000Z',
      reps: 3,
      scheduledDays: 2,
      stability: 2.1,
      state: 2
    },
    title: 'Card one',
    updatedAt: '2026-04-22T08:00:00.000Z',
    ...overrides
  };
}

function createSnapshot() {
  return {
    activeNodeId: 'topic-1',
    nodeOrder: ['topic-1', 'item-1', 'item-2'],
    nodesById: {
      'topic-1': createTopicNode({
        reading: {
          intervalDurationMs: 60000,
          intervalGrowthFactor: 1.5,
          lastHandledAt: '2026-04-21T08:00:00.000Z',
          nextAt: '2026-04-22T08:00:00.000Z',
          priority: 0,
          readingPosition: 0,
          repetitionCount: 1,
          state: 'active'
        }
      }),
      'item-1': createItemNode(),
      'item-2': createItemNode({
        id: 'item-2',
        review: {
          difficulty: 4.1,
          due: '2026-04-22T08:05:00.000Z',
          elapsedDays: 3,
          lapses: 0,
          lastReviewAt: '2026-04-19T08:00:00.000Z',
          reps: 4,
          scheduledDays: 3,
          stability: 2.7,
          state: 2
        },
        title: 'Card two'
      })
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  } satisfies WorkspaceSnapshot;
}

function createDueReadingTopic() {
  return createTopicNode({
    content: 'Readable topic body',
    reading: {
      intervalDurationMs: 60000,
      intervalGrowthFactor: 1.5,
      lastHandledAt: '2026-04-21T08:00:00.000Z',
      nextAt: '2026-04-22T08:00:00.000Z',
      priority: 5,
      readingPosition: 0,
      repetitionCount: 1,
      state: 'active'
    }
  });
}

function createGradedCardResult() {
  return {
    card: {
      difficulty: 3.8,
      due: '2026-04-25T08:10:00.000Z',
      elapsed_days: 0,
      lapses: 0,
      last_review: '2026-04-22T08:10:00.000Z',
      reps: 4,
      scheduled_days: 3,
      stability: 3.4,
      state: 2
    },
    reviewed_at: '2026-04-22T08:10:00.000Z'
  };
}

describe('companionReviewSession', () => {
  beforeEach(() => {
    schedulerGrade.mockReset();
  });

  it('builds the companion review queue from the unified due queue', () => {
    const session = resolveCompanionReviewSession(createSnapshot(), '2026-04-22T08:10:00.000Z');

    expect([...session.queueNodeIds].sort()).toEqual(['item-1', 'item-2', 'topic-1']);
    expect(session.currentCard).toMatchObject({
      nodeId: session.queueNodeIds[0],
      remainingCount: 3,
      reveal: 'Expected answer'
    });
    expect(session.scheduledFsrsCount).toBe(2);
    expect(session.scheduledReadingCount).toBe(1);
    expect(session.nextFsrsDueAt).toBe('2026-04-22T08:00:00.000Z');
  });

  it('updates the graded card and advances to the next due item', async () => {
    schedulerGrade.mockResolvedValue(createGradedCardResult());

    const result = await gradeCompanionReviewCard({
      grade: 3,
      nodeId: 'item-1',
      now: '2026-04-22T08:10:00.000Z',
      snapshot: createSnapshot()
    });

    expect(schedulerGrade).toHaveBeenCalled();
    expect(result?.snapshot.nodesById['item-1']).toMatchObject({
      review: {
        due: '2026-04-25T08:10:00.000Z',
        lastReviewAt: '2026-04-22T08:10:00.000Z',
        reps: 4
      }
    });
    expect(result?.nextSession.currentCard?.nodeId).toBe('item-2');
    expect(result?.nextSession.queueNodeIds).toEqual(['item-2', 'topic-1']);
    expect(result?.reviewLog).toMatchObject({
      cardBefore: {
        due: '2026-04-22T08:00:00.000Z',
        stability: 2.1
      },
      cardAfter: {
        due: '2026-04-25T08:10:00.000Z',
        stability: 3.4
      },
      grade: 3,
      reviewedAt: '2026-04-22T08:10:00.000Z'
    });
  });

  it('keeps due reading items in the unified companion review queue', () => {
    const snapshot = createSnapshot();
    snapshot.nodesById['topic-1'] = createDueReadingTopic();

    const session = resolveCompanionReviewSession(snapshot, '2026-04-22T08:10:00.000Z');

    expect(session.queueNodeIds).toContain('topic-1');
    expect(session.scheduledReadingCount).toBe(1);
  });
});
