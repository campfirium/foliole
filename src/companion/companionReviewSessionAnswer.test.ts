import { describe, expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { buildCurrentCard } from './companionReviewSession';

function createSnapshot(node: WorkspaceSnapshot['nodesById'][string]): WorkspaceSnapshot {
  return {
    activeNodeId: node.id,
    nodeOrder: [node.id],
    nodesById: { [node.id]: node },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

function createReviewNode(overrides: Partial<WorkspaceSnapshot['nodesById'][string]> = {}) {
  return {
    anchorLink: null,
    content: 'Prompt body',
    createdAt: '2026-04-22T08:00:00.000Z',
    hideTitleHeading: false,
    id: 'item-1',
    isTitleManual: false,
    kind: 'item',
    parentNodeId: null,
    reading: null,
    reveal: 'Answer body',
    review: {
      difficulty: 4.2,
      due: '2026-04-22T08:00:00.000Z',
      elapsedDays: 2,
      lapses: 0,
      lastReviewAt: null,
      reps: 3,
      scheduledDays: 2,
      stability: 2.1,
      state: 2
    },
    title: 'Item',
    updatedAt: '2026-04-22T08:00:00.000Z',
    ...overrides
  } satisfies WorkspaceSnapshot['nodesById'][string];
}

describe('companion review session answer state', () => {
  it('marks a card as answerable when reveal text is present', () => {
    const node = createReviewNode();

    expect(buildCurrentCard(createSnapshot(node), [node.id])).toMatchObject({
      hasAnswer: true,
      reveal: 'Answer body'
    });
  });

  it('preserves answer availability for lightweight snapshots with unsynced reveal text', () => {
    const node = {
      ...createReviewNode({ reveal: null }),
      hasReveal: true
    } as WorkspaceSnapshot['nodesById'][string] & { hasReveal: boolean };

    expect(buildCurrentCard(createSnapshot(node), [node.id])).toMatchObject({
      hasAnswer: true,
      reveal: null
    });
  });
});
