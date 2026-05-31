import { expect, it } from 'vitest';

import {
  isCanonicalTrashedNodeId,
  isCanonicalVisibleNodeId,
  selectCanonicalNodeMembership,
  selectCanonicalReviewQueueSource,
  selectCanonicalTrashedNodeDeletedAtById,
  selectCanonicalTrashedNodeIds,
  selectCanonicalVisibleNodeIds,
  selectCanonicalWorkspaceMembershipView
} from './workspaceCanonicalSelectors';

function node(id: string, deletedAt?: string | null) {
  return {
    id,
    ...(deletedAt !== undefined ? { deletedAt } : {})
  };
}

it('derives visible and trash ids from node lifecycle facts', () => {
  const source = {
    nodeOrder: ['visible-1', 'trash-1', 'missing-1'],
    nodesById: {
      'trash-1': node('trash-1', '2026-05-24T00:00:00.000Z'),
      'visible-1': node('visible-1', null)
    }
  };

  expect(selectCanonicalVisibleNodeIds(source)).toEqual(['visible-1']);
  expect(selectCanonicalTrashedNodeIds(source)).toEqual(['trash-1']);
  expect(selectCanonicalTrashedNodeDeletedAtById(source)).toEqual({
    'trash-1': '2026-05-24T00:00:00.000Z'
  });
});

it('uses legacy trash ids only when the node has no lifecycle fact', () => {
  const source = {
    nodeOrder: ['legacy-trash', 'restored'],
    nodesById: {
      'legacy-trash': node('legacy-trash'),
      restored: node('restored', null)
    },
    trashedNodeDeletedAtById: {
      'legacy-trash': '2026-05-24T00:00:00.000Z',
      restored: '2026-05-24T00:00:00.000Z'
    },
    trashedNodeIds: ['legacy-trash', 'restored']
  };

  expect(selectCanonicalVisibleNodeIds(source)).toEqual(['restored']);
  expect(selectCanonicalTrashedNodeIds(source)).toEqual(['legacy-trash']);
  expect(selectCanonicalTrashedNodeDeletedAtById(source)).toEqual({
    'legacy-trash': '2026-05-24T00:00:00.000Z'
  });
});

it('treats bare legacy trash ids as membership input without inventing deletedAt', () => {
  const source = {
    nodeOrder: ['legacy-trash', 'restored'],
    nodesById: {
      'legacy-trash': node('legacy-trash'),
      restored: node('restored', null)
    },
    trashedNodeIds: ['legacy-trash', 'restored']
  };

  expect(isCanonicalVisibleNodeId(source, 'restored')).toBe(true);
  expect(isCanonicalTrashedNodeId(source, 'legacy-trash')).toBe(true);
  expect(selectCanonicalVisibleNodeIds(source)).toEqual(['restored']);
  expect(selectCanonicalTrashedNodeIds(source)).toEqual(['legacy-trash']);
  expect(selectCanonicalTrashedNodeDeletedAtById(source)).toEqual({});
});

it('keeps visible and trashed membership separate for consumption helpers', () => {
  const source = {
    nodeOrder: ['active-trash', 'visible-1'],
    nodesById: {
      'active-trash': node('active-trash', '2026-05-24T00:00:00.000Z'),
      'visible-1': node('visible-1', null)
    }
  };

  expect(selectCanonicalNodeMembership(source, 'active-trash')).toEqual({
    isTrashed: true,
    isVisible: false
  });
  expect(selectCanonicalNodeMembership(source, 'visible-1')).toEqual({
    isTrashed: false,
    isVisible: true
  });
});

it('skips deleted ids in visible order without reordering remaining nodes', () => {
  const source = {
    nodeOrder: ['visible-1', 'trash-1', 'visible-2', 'legacy-trash', 'visible-3'],
    nodesById: {
      'legacy-trash': node('legacy-trash'),
      'trash-1': node('trash-1', '2026-05-24T00:00:00.000Z'),
      'visible-1': node('visible-1', null),
      'visible-2': node('visible-2', null),
      'visible-3': node('visible-3', null)
    },
    trashedNodeIds: ['legacy-trash']
  };

  expect(selectCanonicalVisibleNodeIds(source)).toEqual(['visible-1', 'visible-2', 'visible-3']);
});

it('feeds review queue source with visible order only', () => {
  const source = {
    nodeOrder: ['visible-1', 'trash-1'],
    nodesById: {
      'trash-1': node('trash-1', '2026-05-24T00:00:00.000Z'),
      'visible-1': node('visible-1', null)
    },
    trashedNodeIds: []
  };

  expect(selectCanonicalReviewQueueSource(source)).toMatchObject({
    nodeOrder: ['visible-1'],
    trashedNodeIds: ['trash-1']
  });
});

it('reuses review queue source arrays for unchanged source references', () => {
  const source = {
    nodeOrder: ['visible-1', 'trash-1'],
    nodesById: {
      'trash-1': node('trash-1', '2026-05-24T00:00:00.000Z'),
      'visible-1': node('visible-1', null)
    },
    trashedNodeIds: [] as string[]
  };

  const first = selectCanonicalReviewQueueSource(source);
  const second = selectCanonicalReviewQueueSource(source);

  expect(second.nodeOrder).toBe(first.nodeOrder);
  expect(second.trashedNodeIds).toBe(first.trashedNodeIds);
});

it('keeps canonical input arrays when review queue source is already canonical', () => {
  const nodeOrder = ['visible-1'];
  const trashedNodeIds = ['trash-1'];
  const source = {
    nodeOrder,
    nodesById: {
      'trash-1': node('trash-1', '2026-05-24T00:00:00.000Z'),
      'visible-1': node('visible-1', null)
    },
    trashedNodeIds
  };

  const reviewQueueSource = selectCanonicalReviewQueueSource(source);

  expect(reviewQueueSource.nodeOrder).toBe(nodeOrder);
  expect(reviewQueueSource.trashedNodeIds).toBe(trashedNodeIds);
});

it('refreshes review queue source arrays when source references change', () => {
  const source = {
    nodeOrder: ['visible-1', 'trash-1'],
    nodesById: {
      'trash-1': node('trash-1', '2026-05-24T00:00:00.000Z'),
      'visible-1': node('visible-1', null)
    },
    trashedNodeIds: [] as string[]
  };

  const first = selectCanonicalReviewQueueSource(source);
  const second = selectCanonicalReviewQueueSource({ ...source, nodeOrder: [...source.nodeOrder] });

  expect(second.nodeOrder).toEqual(first.nodeOrder);
  expect(second.nodeOrder).not.toBe(first.nodeOrder);
});

it('builds a single workspace membership view for store consumers', () => {
  const source = {
    nodeOrder: ['visible-1', 'deleted-1', 'restored-1', 'legacy-trash'],
    nodesById: {
      'deleted-1': node('deleted-1', '2026-05-24T00:00:00.000Z'),
      'legacy-trash': node('legacy-trash'),
      'restored-1': node('restored-1', null),
      'visible-1': node('visible-1', null)
    },
    trashedNodeDeletedAtById: {
      'legacy-trash': '2026-05-24T00:01:00.000Z',
      'restored-1': '2026-05-24T00:02:00.000Z'
    },
    trashedNodeIds: ['restored-1', 'legacy-trash']
  };

  expect(selectCanonicalWorkspaceMembershipView(source)).toMatchObject({
    nodeOrder: ['visible-1', 'restored-1'],
    reviewQueueSource: {
      nodeOrder: ['visible-1', 'restored-1'],
      trashedNodeIds: ['legacy-trash', 'deleted-1']
    },
    trashedNodeDeletedAtById: {
      'deleted-1': '2026-05-24T00:00:00.000Z',
      'legacy-trash': '2026-05-24T00:01:00.000Z'
    },
    trashedNodeIds: ['legacy-trash', 'deleted-1']
  });
});
