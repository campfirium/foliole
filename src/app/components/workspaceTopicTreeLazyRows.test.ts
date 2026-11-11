import { expect, it } from 'vitest';

import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import {
  buildTopicChildrenByParent,
  createTopicRowMaterialCounter
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
  const countMaterials = createTopicRowMaterialCounter(childrenByParent, nodesById);

  expect(countMaterials('book')).toBe(0);
  expect(countMaterials('chapter')).toBe(2);
  expect(countMaterials('excerpt')).toBe(1);
  expect(countMaterials('card')).toBe(0);
});
