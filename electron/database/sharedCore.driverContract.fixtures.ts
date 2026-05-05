import { vi } from 'vitest';

export const reviewMutationInput = {
  nodeId: 'node-1',
  grade: 3 as const,
  reviewedAt: '2026-03-14T00:00:00.000Z',
  cardBefore: {
    due: '2026-03-14T00:00:00.000Z',
    last_review: null,
    state: 0 as const,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0
  },
  cardAfter: {
    due: '2026-03-18T00:00:00.000Z',
    last_review: '2026-03-14T00:00:00.000Z',
    state: 1 as const,
    stability: 2.5,
    difficulty: 3.1,
    elapsed_days: 1,
    scheduled_days: 4,
    reps: 1,
    lapses: 0
  }
};

export function createReviewMutationContext() {
  return {
    deviceId: 'desktop-local',
    schedulerVersion: 'ts-fsrs@4',
    createId: vi.fn().mockReturnValueOnce('op-1').mockReturnValueOnce('log-1')
  };
}

export const nodeSnapshotInput = {
  nodeId: 'node-1',
  parentNodeId: null,
  kind: 'item' as const,
  title: 'Node 1',
  isTitleManual: true,
  content: '# Node 1',
  reveal: 'Answer',
  anchorLink: { id: 'anchor-1', kind: 'highlight' as const },
  reading: {
    intervalDurationMs: 0,
    intervalGrowthFactor: 1,
    lastHandledAt: '2026-03-14T00:00:00.000Z',
    nextAt: '2026-03-14T00:00:00.000Z',
    priority: 0,
    readingPosition: 0,
    repetitionCount: 0,
    state: 'dismissed' as const
  },
  position: 2,
  createdAt: '2026-03-14T00:00:00.000Z',
  updatedAt: '2026-03-14T00:00:00.000Z'
};

export const expectedNodeSnapshotParams = [
  'node-1',
  null,
  'item',
  null,
  null,
  'Node 1',
  1,
  0,
  '# Node 1',
  null,
  null,
  'Answer',
  JSON.stringify({ id: 'anchor-1', kind: 'highlight' }),
  null,
  '2026-03-14T00:00:00.000Z',
  '2026-03-14T00:00:00.000Z'
];

export const expectedNodeReadingParams = [
  'node-1',
  0,
  1,
  '2026-03-14T00:00:00.000Z',
  '2026-03-14T00:00:00.000Z',
  0,
  0,
  0,
  'dismissed'
];

export const workspaceSnapshotRows = [
  {
    id: 'node-1',
    parent_id: null,
    title: 'Node 1',
    is_title_manual: 1,
    opening_text: null,
    content: 'content',
    reveal: null,
    anchor_link: null,
    created_at: '2026-03-14T00:00:00.000Z',
    updated_at: '2026-03-14T00:00:00.000Z',
    deleted_at: null,
    review_due: null,
    review_last_review_at: null,
    review_state: null,
    review_stability: null,
    review_difficulty: null,
    review_elapsed_days: null,
    review_scheduled_days: null,
    review_reps: null,
    review_lapses: null
  }
];

export const expectedWorkspaceSnapshot = {
  activeNodeId: 'node-1',
  nodeOrder: ['node-1'],
  nodesById: {
    'node-1': {
      id: 'node-1',
      parentNodeId: null,
      kind: 'topic',
      title: 'Node 1',
      isTitleManual: true,
      hideTitleHeading: false,
      openingText: null,
      content: 'content',
      virtualFilter: null,
      reveal: null,
      anchorLink: null,
      reading: null,
      review: null,
      createdAt: '2026-03-14T00:00:00.000Z',
      updatedAt: '2026-03-14T00:00:00.000Z'
    }
  },
  trashedNodeIds: [],
  untitledSequenceByParent: {}
};
