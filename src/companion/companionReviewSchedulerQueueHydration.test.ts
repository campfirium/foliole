import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  getReviewSchedulerVersion,
  hydrateCurrentReviewSchedulerSettings
} from '../features/settings/model/reviewSchedulerSettings';

import { gradeCompanionReviewCard, resolveCompanionReviewSession } from './companionReviewSession';

const schedulerGrade = vi.fn();

vi.mock('../features/review/model/reviewSchedulerFactory', () => ({
  createReviewSchedulerAdapter: () => ({ grade: schedulerGrade })
}));

type SnapshotNode = WorkspaceSnapshot['nodesById'][string];

function createItemNode(id: string): SnapshotNode {
  return {
    anchorLink: null,
    content: 'Question prompt',
    createdAt: '2026-04-22T08:00:00.000Z',
    hideTitleHeading: false,
    id,
    isTitleManual: false,
    kind: 'item',
    parentNodeId: null,
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
    title: id,
    updatedAt: '2026-04-22T08:00:00.000Z'
  };
}

function createSnapshot() {
  return {
    activeNodeId: 'item-1',
    nodeOrder: ['item-1', 'item-2'],
    nodesById: {
      'item-1': createItemNode('item-1'),
      'item-2': createItemNode('item-2')
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  } satisfies WorkspaceSnapshot;
}

describe('companion review scheduler queue hydration', () => {
  beforeEach(() => {
    hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
    schedulerGrade.mockReset();
  });

  it('uses hydrated review scheduler settings for due queue planning', () => {
    hydrateCurrentReviewSchedulerSettings({
      ...DEFAULT_REVIEW_SCHEDULER_SETTINGS,
      newDayStartsAtHour: 10,
      updatedAt: '2026-04-22T05:55:00.000Z'
    });

    const session = resolveCompanionReviewSession(createSnapshot(), '2026-04-22T00:00:00.000Z');

    expect(session.queueNodeIds).toEqual([]);
    expect(session.scheduledFsrsCount).toBe(2);
  });

  it('records the same hydrated settings version used by queue planning', async () => {
    const settings = {
      ...DEFAULT_REVIEW_SCHEDULER_SETTINGS,
      desiredRetention: 0.82,
      newDayStartsAtHour: 10,
      updatedAt: '2026-04-22T05:55:00.000Z'
    };
    hydrateCurrentReviewSchedulerSettings(settings);
    schedulerGrade.mockResolvedValue({
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
    });

    const snapshot = createSnapshot();
    expect(resolveCompanionReviewSession(snapshot, '2026-04-22T00:00:00.000Z').queueNodeIds).toEqual([]);
    const result = await gradeCompanionReviewCard({
      grade: 3,
      nodeId: 'item-1',
      now: '2026-04-22T08:10:00.000Z',
      snapshot
    });

    expect(result?.reviewLog.schedulerVersion).toBe(getReviewSchedulerVersion(settings));
  });
});
