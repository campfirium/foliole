import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { WorkspaceTopicTree } from './WorkspaceTopicTree';

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

  const { rerender } = renderWithLocalization(
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

it('keeps the topic tree top anchor when the review item is already visible', async () => {
  const nodesById = {
    'source-topic': createNode({ id: 'source-topic', title: 'Source Topic' }),
    'review-item': createNode({ id: 'review-item', title: 'Review Item' })
  };

  renderWithLocalization(
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

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  const scrollContainer = itemColumn.querySelector('.app-scrollbar') as HTMLDivElement;
  const reviewRow = within(itemColumn).getByRole('treeitem', { name: 'Review Item' });
  expect(within(itemColumn).getByRole('treeitem', { name: 'Review Item' })).toHaveAttribute('aria-current', 'page');

  Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 100 });
  Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(reviewRow, 'offsetTop', { configurable: true, value: 40 });
  Object.defineProperty(reviewRow, 'offsetHeight', { configurable: true, value: 30 });
  scrollContainer.scrollTop = 0;

  await waitFor(() => expect(scrollContainer.scrollTop).toBe(0));
});

it('scrolls an offscreen review item into view without second-row anchoring', async () => {
  const nodesById = {
    'earlier-topic': createNode({ id: 'earlier-topic', title: 'Earlier Topic' }),
    'review-item': createNode({ id: 'review-item', title: 'Review Item' })
  };

  renderWithLocalization(
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
  const reviewRow = within(itemColumn).getByRole('treeitem', { name: 'Review Item' });
  expect(reviewRow).toHaveAttribute('aria-current', 'page');

  Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 100 });
  Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(reviewRow, 'offsetTop', { configurable: true, value: 260 });
  Object.defineProperty(reviewRow, 'offsetHeight', { configurable: true, value: 30 });

  await waitFor(() => expect(scrollContainer.scrollTop).toBe(222));
});

it('keeps a visible parent topic anchored for child review items', async () => {
  const nodesById = {
    'earlier-topic': createNode({ id: 'earlier-topic', title: 'Earlier Topic' }),
    'source-topic': createNode({ id: 'source-topic', title: 'Source Topic' }),
    'review-item': createNode({
      id: 'review-item',
      parentNodeId: 'source-topic',
      title: 'Review Item'
    })
  };

  renderWithLocalization(
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
  const sourceRow = within(itemColumn).getByRole('treeitem', { name: 'Source Topic', expanded: true });
  expect(within(itemColumn).getByRole('treeitem', { name: 'Review Item' })).toHaveAttribute('aria-current', 'page');

  Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 100 });
  Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(sourceRow, 'offsetTop', { configurable: true, value: 120 });
  Object.defineProperty(sourceRow, 'offsetHeight', { configurable: true, value: 30 });
  scrollContainer.scrollTop = 120;

  await waitFor(() => expect(scrollContainer.scrollTop).toBe(120));
});
