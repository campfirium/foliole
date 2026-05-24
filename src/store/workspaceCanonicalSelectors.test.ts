import { expect, it } from 'vitest';

import {
  isCanonicalTrashedNodeId,
  isCanonicalVisibleNodeId,
  selectCanonicalReviewQueueSource,
  selectCanonicalTrashedNodeDeletedAtById,
  selectCanonicalTrashedNodeIds,
  selectCanonicalVisibleNodeIds
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
