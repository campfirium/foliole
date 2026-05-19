import { expect, it } from 'vitest';

import { resolveWorkspaceTopicTreeReviewScroll } from './workspaceTopicTreeReviewScroll';

function createNode(args: {
  anchorLink?: { id: string; kind: 'highlight' };
  id: string;
  parentNodeId?: string | null;
  title: string;
}) {
  return {
    anchorLink: args.anchorLink ?? null,
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id: args.id,
    kind: 'topic' as const,
    parentNodeId: args.parentNodeId ?? null,
    reading: null,
    review: null,
    title: args.title,
    updatedAt: '2026-04-20T00:00:00.000Z'
  };
}

function createRows(nodes: ReturnType<typeof createNode>[]) {
  return nodes.map((node) => ({
    descendantCount: 0,
    depth: node.parentNodeId ? 1 : 0,
    hasChildren: false,
    node
  }));
}

it('uses the parent topic as the review anchor for plain child items', () => {
  const sourceTopic = createNode({ id: 'source-topic', title: 'Source Topic' });
  const reviewItem = createNode({
    id: 'review-item',
    parentNodeId: 'source-topic',
    title: 'Review Item'
  });

  expect(resolveWorkspaceTopicTreeReviewScroll({
    focusedNodeId: 'review-item',
    forceVisibleNodeId: 'review-item',
    nodesById: { 'review-item': reviewItem, 'source-topic': sourceTopic },
    rows: createRows([sourceTopic, reviewItem])
  })).toEqual({ placement: 'second-visible-row', scrollNodeId: 'source-topic' });
});

it('keeps the source topic as the review anchor even when a derived child is distant', () => {
  const sourceTopic = createNode({ id: 'source-topic', title: 'Source Topic' });
  const highlightNodes = Array.from({ length: 18 }, (_, index) =>
    createNode({
      id: `highlight-${index + 1}`,
      parentNodeId: 'source-topic',
      title: `Highlight ${index + 1}`
    })
  );
  const reviewItem = createNode({
    anchorLink: { id: 'anchor-a', kind: 'highlight' },
    id: 'review-item',
    parentNodeId: 'source-topic',
    title: 'Review Item'
  });

  expect(resolveWorkspaceTopicTreeReviewScroll({
    focusedNodeId: 'review-item',
    forceVisibleNodeId: 'review-item',
    nodesById: { 'review-item': reviewItem, 'source-topic': sourceTopic },
    rows: createRows([sourceTopic, ...highlightNodes, reviewItem])
  })).toEqual({ placement: 'second-visible-row', scrollNodeId: 'source-topic' });
});

it('falls back to the focused child when the parent is not visible', () => {
  const reviewItem = createNode({
    id: 'review-item',
    parentNodeId: 'source-topic',
    title: 'Review Item'
  });

  expect(resolveWorkspaceTopicTreeReviewScroll({
    focusedNodeId: 'review-item',
    forceVisibleNodeId: 'review-item',
    nodesById: { 'review-item': reviewItem },
    rows: createRows([reviewItem])
  })).toEqual({ placement: 'near-visible-row', scrollNodeId: 'review-item' });
});
