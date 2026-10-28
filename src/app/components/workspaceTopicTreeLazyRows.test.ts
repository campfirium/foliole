import { expect, it } from 'vitest';

import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import {
  buildTopicChildrenByParent,
  createDerivedMaterialDirectChildCounter
} from './workspaceTopicTreeLazyRows';

function createTopic(id: string, parentNodeId: string | null = null, anchorLink = false): WorkspaceListNode {
  return {
    anchorLink: anchorLink ? { id: `${id}-anchor`, kind: 'highlight' } : null,
    createdAt: '2026-05-24T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id,
    kind: 'topic',
    parentNodeId,
    reading: null,
    review: null,
    title: id,
    updatedAt: '2026-05-24T00:00:00.000Z'
  };
}

function createReviewItem(id: string, parentNodeId: string): WorkspaceListNode {
  return {
    ...createTopic(id, parentNodeId),
    hasReveal: true,
    kind: 'item',
    review: { lastReviewAt: null }
  };
}

it('counts direct derived materials without counting nested chapter materials', () => {
  const nodesById: WorkspaceListNodesById = {
    book: createTopic('book'),
    chapter: createTopic('chapter', 'book'),
    excerpt: createTopic('excerpt', 'chapter', true),
    card: createReviewItem('card', 'chapter'),
    nestedCard: createReviewItem('nestedCard', 'excerpt')
  };
  const childrenByParent = buildTopicChildrenByParent(Object.keys(nodesById), nodesById);
  const countDirectDerivedMaterials = createDerivedMaterialDirectChildCounter(childrenByParent, nodesById);

  expect(countDirectDerivedMaterials('book')).toBe(0);
  expect(countDirectDerivedMaterials('chapter')).toBe(2);
  expect(countDirectDerivedMaterials('excerpt')).toBe(1);
  expect(countDirectDerivedMaterials('card')).toBe(0);
});
