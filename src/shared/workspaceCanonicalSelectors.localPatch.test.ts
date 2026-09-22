import { expect, it } from 'vitest';

import {
  selectCanonicalReviewQueueSource,
  selectCanonicalWorkspaceMembershipView
} from './workspaceCanonicalSelectors';
import { patchWorkspaceRecord } from './workspaceRecordPatch';

function createNode(id: string) {
  return {
    content: '', createdAt: '2026-09-22T00:00:00.000Z', deletedAt: null,
    hasContent: true, hasReveal: false, id, kind: 'topic', parentNodeId: null,
    priority: null, reading: null as unknown, reveal: null, review: null, shelvedAt: null
  };
}

it('keeps membership and review inputs stable for a body-only local patch', () => {
  const nodeOrder = ['node-1', 'node-2'];
  const trashedNodeIds: string[] = [];
  const nodesById = { 'node-1': createNode('node-1'), 'node-2': createNode('node-2') };
  const source = { nodeOrder, nodesById, trashedNodeIds };
  const firstMembership = selectCanonicalWorkspaceMembershipView(source);
  const firstReview = selectCanonicalReviewQueueSource(source);
  const nextNodesById = patchWorkspaceRecord(nodesById, {
    'node-1': { ...nodesById['node-1'], content: 'Loaded body' }
  });
  const nextSource = { nodeOrder, nodesById: nextNodesById, trashedNodeIds };

  const secondMembership = selectCanonicalWorkspaceMembershipView(nextSource);
  const secondReview = selectCanonicalReviewQueueSource(nextSource);

  expect(secondMembership.nodeOrder).toBe(firstMembership.nodeOrder);
  expect(secondMembership.trashedNodeIds).toBe(firstMembership.trashedNodeIds);
  expect(secondReview.nodesById).toBe(firstReview.nodesById);
});

it('invalidates review inputs when a local patch changes scheduling facts', () => {
  const nodeOrder = ['node-1'];
  const trashedNodeIds: string[] = [];
  const nodesById = { 'node-1': createNode('node-1') };
  const first = selectCanonicalReviewQueueSource({ nodeOrder, nodesById, trashedNodeIds });
  const nextNodesById = patchWorkspaceRecord(nodesById, {
    'node-1': { ...nodesById['node-1'], reading: { state: 'dismissed' } }
  });

  const second = selectCanonicalReviewQueueSource({ nodeOrder, nodesById: nextNodesById, trashedNodeIds });

  expect(second.nodesById).not.toBe(first.nodesById);
});
