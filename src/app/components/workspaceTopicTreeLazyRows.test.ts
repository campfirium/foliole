import { expect, it } from 'vitest';

import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { buildTopicChildrenByParent, createDerivedMaterialDescendantCounter } from './workspaceTopicTreeLazyRows';

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
    review: {
      difficulty: 0,
      due: '2026-05-24T00:00:00.000Z',
      elapsedDays: 0,
      lapses: 0,
      lastReviewAt: null,
      reps: 0,
      scheduledDays: 0,
      stability: 0,
      state: 0
    }
  };
}

it('counts descendant derived materials without counting plain chapter topics', () => {
  const nodesById: WorkspaceListNodesById = {
    book: createTopic('book'),
    chapter: createTopic('chapter', 'book'),
    excerpt: createTopic('excerpt', 'chapter', true),
    card: createReviewItem('card', 'chapter'),
    nestedCard: createReviewItem('nestedCard', 'excerpt')
  };
  const childrenByParent = buildTopicChildrenByParent(Object.keys(nodesById), nodesById);
  const countDescendantDerivedMaterials = createDerivedMaterialDescendantCounter(childrenByParent, nodesById);

  expect(countDescendantDerivedMaterials('book')).toBe(3);
  expect(countDescendantDerivedMaterials('chapter')).toBe(3);
  expect(countDescendantDerivedMaterials('excerpt')).toBe(1);
  expect(countDescendantDerivedMaterials('card')).toBe(0);
});
