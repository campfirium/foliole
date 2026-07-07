import { beforeEach, describe, expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  hydrateCurrentReviewSchedulerSettings
} from '../features/settings/model/reviewSchedulerSettings';

import { resolveCompanionReviewSession } from './companionReviewSession';

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
});
