import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { useWorkspaceStore } from '../../store/workspaceStore';

import { WorkspaceTopicTree } from './WorkspaceTopicTree';
import { resolveSecondVisibleRowScrollPadding } from './workspaceTopicTreeScrollPadding';

function createNode(args: {
  anchorLink?: { id: string; kind: 'highlight' };
  id: string;
  parentNodeId?: string | null;
  title: string;
}) {
  return {
    anchorLink: args.anchorLink ?? null,
    content: 'Body',
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id: args.id,
    kind: 'topic' as const,
    parentNodeId: args.parentNodeId ?? null,
    reveal: null,
    review: null,
    title: args.title,
    updatedAt: '2026-04-20T00:00:00.000Z'
  };
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkspaceStore.setState((state) => ({
    ...state,
    nodeViewById: {},
    trashedNodeIds: []
  }));
});

it('opens the active review item and its descendants in the item column', () => {
  const nodesById = {
    'source-topic': createNode({ id: 'source-topic', title: 'Source Topic' }),
    'review-item': createNode({
      id: 'review-item',
      parentNodeId: 'source-topic',
      title: 'Review Item'
    }),
    'review-child': createNode({
      id: 'review-child',
      parentNodeId: 'review-item',
      title: 'Review Child'
    })
  };

  const { rerender } = render(
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="review-item"
      forceVisibleNodeId="review-item"
      itemIds={['source-topic', 'review-item', 'review-child']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });

  expect(within(itemColumn).getByRole('treeitem', { name: 'Source Topic', expanded: true })).toBeInTheDocument();
  expect(within(itemColumn).getByRole('treeitem', { name: 'Review Item', expanded: true })).toHaveAttribute('aria-current', 'page');
  expect(within(itemColumn).getByRole('treeitem', { name: 'Review Child' })).toBeInTheDocument();

  const reviewItem = within(itemColumn).getByRole('treeitem', { name: 'Review Item', expanded: true });
  fireEvent.click(reviewItem.querySelector('[data-node-tree-chevron="true"]') as HTMLElement);

  expect(within(itemColumn).getByRole('treeitem', { name: 'Review Item', expanded: false })).toHaveAttribute('aria-current', 'page');
  expect(within(itemColumn).queryByRole('treeitem', { name: 'Review Child' })).toBeNull();

  rerender(
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="review-child"
      forceVisibleNodeId="review-child"
      itemIds={['source-topic', 'review-item', 'review-child']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  expect(within(itemColumn).getByRole('treeitem', { name: 'Review Item', expanded: true })).toBeInTheDocument();
  expect(within(itemColumn).getByRole('treeitem', { name: 'Review Child' })).toHaveAttribute('aria-current', 'page');
});

it('positions the active review item as the second visible row when possible', async () => {
  const nodesById = {
    'earlier-topic': createNode({ id: 'earlier-topic', title: 'Earlier Topic' }),
    'review-item': createNode({ id: 'review-item', title: 'Review Item' })
  };

  render(
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="review-item"
      forceVisibleNodeId="review-item"
      itemIds={['earlier-topic', 'review-item']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  const scrollContainer = itemColumn.querySelector('.app-scrollbar') as HTMLDivElement;
  const earlierRow = within(itemColumn).getByRole('treeitem', { name: 'Earlier Topic' });
  expect(within(itemColumn).getByRole('treeitem', { name: 'Review Item' })).toHaveAttribute('aria-current', 'page');

  Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 100 });
  Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(earlierRow, 'offsetTop', { configurable: true, value: 160 });

  await waitFor(() => expect(scrollContainer.scrollTop).toBe(160));
});

it('uses the source topic as the second-row review anchor for nearby derived items', async () => {
  const nodesById = {
    'earlier-topic': createNode({ id: 'earlier-topic', title: 'Earlier Topic' }),
    'source-topic': createNode({ id: 'source-topic', title: 'Source Topic' }),
    'review-item': createNode({
      anchorLink: { id: 'anchor-a', kind: 'highlight' },
      id: 'review-item',
      parentNodeId: 'source-topic',
      title: 'Review Item'
    })
  };

  render(
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="review-item"
      forceVisibleNodeId="review-item"
      itemIds={['earlier-topic', 'source-topic', 'review-item']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  const scrollContainer = itemColumn.querySelector('.app-scrollbar') as HTMLDivElement;
  const earlierRow = within(itemColumn).getByRole('treeitem', { name: 'Earlier Topic' });
  expect(within(itemColumn).getByRole('treeitem', { name: 'Review Item' })).toHaveAttribute('aria-current', 'page');

  Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 100 });
  Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(earlierRow, 'offsetTop', { configurable: true, value: 160 });

  await waitFor(() => expect(scrollContainer.scrollTop).toBe(160));
});

it('uses the parent topic as the second-row review anchor for plain child items', async () => {
  const nodesById = {
    'earlier-topic': createNode({ id: 'earlier-topic', title: 'Earlier Topic' }),
    'source-topic': createNode({ id: 'source-topic', title: 'Source Topic' }),
    'review-item': createNode({
      id: 'review-item',
      parentNodeId: 'source-topic',
      title: 'Review Item'
    })
  };

  render(
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="review-item"
      forceVisibleNodeId="review-item"
      itemIds={['earlier-topic', 'source-topic', 'review-item']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  const scrollContainer = itemColumn.querySelector('.app-scrollbar') as HTMLDivElement;
  const earlierRow = within(itemColumn).getByRole('treeitem', { name: 'Earlier Topic' });
  expect(within(itemColumn).getByRole('treeitem', { name: 'Review Item' })).toHaveAttribute('aria-current', 'page');

  Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 100 });
  Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(earlierRow, 'offsetTop', { configurable: true, value: 160 });

  await waitFor(() => expect(scrollContainer.scrollTop).toBe(160));
});

it('reserves the first visual row when the source topic is the first list item', async () => {
  const nodesById = {
    'source-topic': createNode({ id: 'source-topic', title: 'Source Topic' }),
    'review-item': createNode({
      anchorLink: { id: 'anchor-a', kind: 'highlight' },
      id: 'review-item',
      parentNodeId: 'source-topic',
      title: 'Review Item'
    })
  };

  render(
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="review-item"
      forceVisibleNodeId="review-item"
      itemIds={['source-topic', 'review-item']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  const tree = screen.getByRole('tree', { name: 'Topic list' });
  expect(within(tree).getByRole('treeitem', { name: 'Review Item' })).toHaveAttribute('aria-current', 'page');
  await waitFor(() => expect(Number.parseFloat(tree.style.paddingTop)).toBeGreaterThan(0));
});

it('keeps enough bottom scroll room to place a tail review item on the second row', () => {
  expect(resolveSecondVisibleRowScrollPadding(640, 36)).toBe(568);
  expect(resolveSecondVisibleRowScrollPadding(640, 36, 'near-visible-row')).toBe(532);
  expect(resolveSecondVisibleRowScrollPadding(64, 36)).toBe(0);
});
