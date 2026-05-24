import { expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { resolveCompanionReviewSession } from './companionReviewSession';

type SnapshotNode = WorkspaceSnapshot['nodesById'][string];

function createFsrsNode(id: string, deletedAt?: string): SnapshotNode {
  return {
    anchorLink: null,
    content: 'Question prompt',
    createdAt: '2026-04-22T08:00:00.000Z',
    ...(deletedAt ? { deletedAt } : {}),
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

it('excludes deleted nodes from companion review even when legacy trash projection is stale', () => {
  const session = resolveCompanionReviewSession({
    activeNodeId: null,
    nodeOrder: ['item-deleted', 'item-visible'],
    nodesById: {
      'item-deleted': createFsrsNode('item-deleted', '2026-04-22T08:02:00.000Z'),
      'item-visible': createFsrsNode('item-visible')
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  }, '2026-04-22T08:10:00.000Z');

  expect(session.queueNodeIds).toEqual(['item-visible']);
  expect(session.scheduledFsrsCount).toBe(1);
});
