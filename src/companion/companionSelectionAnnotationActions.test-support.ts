import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

export function createSnapshotWithScheduledItem(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const due = new Date(2026, 4, 22, 4).toISOString();
  return {
    ...snapshot,
    nodeOrder: [...snapshot.nodeOrder, 'scheduled-item'],
    nodesById: {
      ...snapshot.nodesById,
      'scheduled-item': {
        ...snapshot.nodesById.parent!,
        id: 'scheduled-item',
        kind: 'item',
        parentNodeId: 'parent',
        reveal: 'Answer',
        review: {
          difficulty: 0,
          due,
          elapsedDays: 0,
          lapses: 0,
          lastReviewAt: null,
          reps: 0,
          scheduledDays: 0,
          stability: 0,
          state: 0
        }
      }
    }
  };
}

export function createExpectedNewReview() {
  return {
    difficulty: 0,
    due: new Date(2026, 4, 23, 4).toISOString(),
    elapsedDays: 0,
    lapses: 0,
    lastReviewAt: null,
    reps: 0,
    scheduledDays: 0,
    stability: 0,
    state: 0 as const
  };
}
