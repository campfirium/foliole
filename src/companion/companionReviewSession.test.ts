import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { getCurrentReviewSchedulerSettings, getReviewSchedulerVersion } from '../features/settings/model/reviewSchedulerSettings';

import { resolveCompanionFsrsReviewSession } from './companionFsrsReviewSession';
import { postponeCompanionReviewTopic } from './companionReadingReviewSessionActions';
import {
  gradeCompanionReviewCard,
  resolveCompanionReviewSession
} from './companionReviewSession';

const schedulerGrade = vi.fn();
const localIso = (day: number, hour = 16, minute = 0) => new Date(2026, 3, day, hour, minute).toISOString();
const REVIEWED_AT = localIso(22, 16, 10);
const SCHEDULED_DUE = localIso(25, 4);

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
    createdAt: localIso(22),
    hideTitleHeading: false,
    id: 'topic-1',
    isTitleManual: false,
    kind: 'topic',
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title: 'Topic',
    updatedAt: localIso(22),
    ...overrides
  };
}

function createItemNode(overrides: Partial<SnapshotNode> = {}): SnapshotNode {
  return {
    anchorLink: null,
    content: 'Question prompt',
    createdAt: localIso(22),
    hideTitleHeading: false,
    id: 'item-1',
    isTitleManual: false,
    kind: 'item',
    parentNodeId: 'topic-1',
    reading: null,
    reveal: 'Expected answer',
    review: {
      difficulty: 4.2,
      due: localIso(22),
      elapsedDays: 2,
      lapses: 0,
      lastReviewAt: localIso(20),
      reps: 3,
      scheduledDays: 2,
      stability: 2.1,
      state: 2
    },
    title: 'Card one',
    updatedAt: localIso(22),
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
          lastHandledAt: localIso(21),
          nextAt: localIso(22),
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
          due: localIso(22, 16, 5),
          elapsedDays: 3,
          lapses: 0,
          lastReviewAt: localIso(19),
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
      lastHandledAt: localIso(21),
      nextAt: localIso(22),
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
      due: localIso(25, 16, 10),
      elapsed_days: 0,
      lapses: 0,
      last_review: REVIEWED_AT,
      reps: 4,
      scheduled_days: 3,
      stability: 3.4,
      state: 2
    },
    reviewed_at: REVIEWED_AT
  };
}

function expectCompanionLaterUsesDesktopReadingInterval() {
  const snapshot = createSnapshot();
  snapshot.nodesById['topic-1'] = createDueReadingTopic();

  const result = postponeCompanionReviewTopic({
    nodeId: 'topic-1',
    now: REVIEWED_AT,
    snapshot
  });

  expect(result?.snapshot.nodesById['topic-1']?.reading).toMatchObject({
    lastHandledAt: REVIEWED_AT,
    nextAt: localIso(23, 16, 10),
    repetitionCount: 2
  });
}

describe('companionReviewSession', () => {
  beforeEach(() => {
    schedulerGrade.mockReset();
  });

  it('builds the companion review queue from the unified due queue', () => {
    const session = resolveCompanionReviewSession(createSnapshot(), REVIEWED_AT);

    expect([...session.queueNodeIds].sort()).toEqual(['item-1', 'item-2', 'topic-1']);
    expect(session.currentCard).toMatchObject({
      nodeId: session.queueNodeIds[0],
      remainingCount: 3,
      reveal: 'Expected answer'
    });
    expect(session.scheduledFsrsCount).toBe(2);
    expect(session.scheduledReadingCount).toBe(1);
    expect(session.nextFsrsDueAt).toBe(localIso(22));
  });

  it('updates the graded card and advances to the next due item', async () => {
    schedulerGrade.mockResolvedValue(createGradedCardResult());

    const result = await gradeCompanionReviewCard({
      grade: 3,
      nodeId: 'item-1',
      now: REVIEWED_AT,
      snapshot: createSnapshot()
    });

    expect(schedulerGrade).toHaveBeenCalled();
    expect(result?.snapshot.nodesById['item-1']).toMatchObject({
      review: {
        due: SCHEDULED_DUE,
        lastReviewAt: REVIEWED_AT,
        reps: 4
      }
    });
    expect(result?.nextSession.currentCard?.nodeId).toBe('item-2');
    expect(result?.nextSession.queueNodeIds).toEqual(['item-2', 'topic-1']);
    expect(result?.reviewLog).toMatchObject({
      cardBefore: {
        due: localIso(22),
        stability: 2.1
      },
      cardAfter: {
        due: SCHEDULED_DUE,
        stability: 3.4
      },
      grade: 3,
      reviewedAt: REVIEWED_AT,
      schedulerVersion: getReviewSchedulerVersion(getCurrentReviewSchedulerSettings())
    });
  });
});

describe('companion reading review session actions', () => {
  it('keeps due reading items in the unified companion review queue', () => {
    const snapshot = createSnapshot();
    snapshot.nodesById['topic-1'] = createDueReadingTopic();

    const session = resolveCompanionReviewSession(snapshot, REVIEWED_AT);

    expect(session.queueNodeIds).toContain('topic-1');
    expect(session.scheduledReadingCount).toBe(1);
  });

  it('builds an FSRS-only queue without changing the mixed review queue', () => {
    const snapshot = createSnapshot();
    snapshot.nodesById['topic-1'] = createDueReadingTopic();

    const onlyReview = resolveCompanionFsrsReviewSession(snapshot, REVIEWED_AT);
    const mixed = resolveCompanionReviewSession(snapshot, REVIEWED_AT);

    expect([...onlyReview.queueNodeIds].sort()).toEqual(['item-1', 'item-2']);
    expect(onlyReview.currentCard?.itemKind).toBe('fsrs');
    expect(onlyReview.scheduledReadingCount).toBe(1);
    expect(mixed.queueNodeIds).toContain('topic-1');
  });

  it('postpones companion reading topics with the same Later interval as desktop', () => {
    expectCompanionLaterUsesDesktopReadingInterval();
  });

});
