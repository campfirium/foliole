import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { WorkspaceTopicTree } from './WorkspaceTopicTree';

function createTopic(args: {
  id: string;
  parentNodeId?: string | null;
  readingState?: 'active' | 'done' | 'dismissed';
  title: string;
}) {
  return {
    anchorLink: null,
    content: 'Body',
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id: args.id,
    kind: 'topic' as const,
    parentNodeId: args.parentNodeId ?? null,
    reading: args.readingState ? {
      intervalDurationMs: 0,
      intervalGrowthFactor: 1,
      lastHandledAt: '2026-04-20T00:00:00.000Z',
      nextAt: '2026-04-20T00:00:00.000Z',
      priority: 0,
      readingPosition: 0,
      repetitionCount: 0,
      state: args.readingState
    } : null,
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

it('hides fully dismissed topic branches and keeps active descendants after the view toggle is enabled', () => {
  const nodesById = {
    'dismissed-parent': createTopic({ id: 'dismissed-parent', readingState: 'dismissed', title: 'Dismissed Parent' }),
    'active-child': createTopic({
      id: 'active-child',
      parentNodeId: 'dismissed-parent',
      readingState: 'active',
      title: 'Active Child'
    }),
    'dismissed-branch': createTopic({ id: 'dismissed-branch', readingState: 'dismissed', title: 'Dismissed Branch' }),
    'dismissed-child': createTopic({
      id: 'dismissed-child',
      parentNodeId: 'dismissed-branch',
      readingState: 'dismissed',
      title: 'Dismissed Child'
    }),
    'active-topic': createTopic({ id: 'active-topic', readingState: 'active', title: 'Active Topic' })
  };

  renderWithLocalization(
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="active-topic"
      itemIds={['dismissed-parent', 'active-child', 'dismissed-branch', 'dismissed-child', 'active-topic']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  expect(within(itemColumn).getByRole('treeitem', { name: 'Dismissed Parent' })).toBeInTheDocument();
  fireEvent.click(within(itemColumn).getByRole('button', { name: 'Expand all topics' }));
  expect(within(itemColumn).getByRole('treeitem', { name: 'Active Child' })).toBeInTheDocument();

  fireEvent.click(within(itemColumn).getByRole('button', { name: 'Hide dismissed and shelved topics' }));

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.viewHideDismissedTopics)).toBe('true');
  expect(within(itemColumn).getByRole('treeitem', { name: 'Dismissed Parent' })).toBeInTheDocument();
  expect(within(itemColumn).getByRole('treeitem', { name: 'Active Child' })).toBeInTheDocument();
  expect(within(itemColumn).queryByRole('treeitem', { name: 'Dismissed Branch' })).toBeNull();
  expect(within(itemColumn).queryByRole('treeitem', { name: 'Dismissed Child' })).toBeNull();
  expect(within(itemColumn).getByRole('treeitem', { name: 'Active Topic' })).toBeInTheDocument();
});

it('keeps title search able to show dismissed matches while the view hides dismissed topics', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.viewHideDismissedTopics, 'true');
  const nodesById = {
    'dismissed-parent': createTopic({ id: 'dismissed-parent', readingState: 'dismissed', title: 'Dismissed Parent' }),
    'active-topic': createTopic({ id: 'active-topic', readingState: 'active', title: 'Active Topic' })
  };

  renderWithLocalization(
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="active-topic"
      itemIds={['dismissed-parent', 'active-topic']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  expect(within(itemColumn).queryByRole('treeitem', { name: 'Dismissed Parent' })).toBeNull();

  fireEvent.click(within(itemColumn).getByRole('button', { name: 'Open title search' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search topic titles' }), {
    target: { value: 'dismissed' }
  });

  expect(within(itemColumn).getByRole('treeitem', { name: 'Dismissed Parent' })).toBeInTheDocument();
});

it('shows all dismissed branches for the active review item when topic focus is off', () => {
  const nodesById = {
    'source-topic': createTopic({ id: 'source-topic', readingState: 'dismissed', title: 'Source Topic' }),
    'review-item': createTopic({
      id: 'review-item',
      parentNodeId: 'source-topic',
      readingState: 'active',
      title: 'Review Item'
    }),
    'dismissed-sibling': createTopic({
      id: 'dismissed-sibling',
      parentNodeId: 'source-topic',
      readingState: 'dismissed',
      title: 'Dismissed Sibling'
    }),
    'partial-parent': createTopic({
      id: 'partial-parent',
      parentNodeId: 'source-topic',
      readingState: 'dismissed',
      title: 'Partial Parent'
    }),
    'active-child': createTopic({
      id: 'active-child',
      parentNodeId: 'partial-parent',
      readingState: 'active',
      title: 'Active Child'
    })
  };

  renderWithLocalization(
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="review-item"
      forceVisibleNodeId="review-item"
      itemIds={['source-topic', 'review-item', 'dismissed-sibling', 'partial-parent', 'active-child']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  expect(within(itemColumn).getByRole('treeitem', { name: 'Source Topic' })).toBeInTheDocument();
  expect(within(itemColumn).getByRole('treeitem', { name: 'Review Item' })).toHaveAttribute('aria-current', 'page');
  expect(within(itemColumn).getByRole('treeitem', { name: 'Dismissed Sibling' })).toBeInTheDocument();
  expect(within(itemColumn).getByRole('treeitem', { name: 'Partial Parent' })).toBeInTheDocument();
  expect(within(itemColumn).getByRole('treeitem', { name: 'Active Child' })).toBeInTheDocument();
});

it('hides fully dismissed branches but keeps partially dismissed branches for the focused active review item', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.viewHideDismissedTopics, 'true');
  const nodesById = {
    'source-topic': createTopic({ id: 'source-topic', readingState: 'dismissed', title: 'Source Topic' }),
    'review-item': createTopic({
      id: 'review-item',
      parentNodeId: 'source-topic',
      readingState: 'active',
      title: 'Review Item'
    }),
    'dismissed-sibling': createTopic({
      id: 'dismissed-sibling',
      parentNodeId: 'source-topic',
      readingState: 'dismissed',
      title: 'Dismissed Sibling'
    }),
    'active-descendant': createTopic({
      id: 'active-descendant',
      parentNodeId: 'review-item',
      readingState: 'active',
      title: 'Active Descendant'
    })
  };

  renderWithLocalization(
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="review-item"
      forceVisibleNodeId="review-item"
      itemIds={['source-topic', 'review-item', 'dismissed-sibling', 'active-descendant']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  expect(within(itemColumn).getByRole('treeitem', { name: 'Source Topic' })).toBeInTheDocument();
  expect(within(itemColumn).getByRole('treeitem', { name: 'Review Item' })).toHaveAttribute('aria-current', 'page');
  expect(within(itemColumn).getByRole('treeitem', { name: 'Active Descendant' })).toBeInTheDocument();
  expect(within(itemColumn).queryByRole('treeitem', { name: 'Dismissed Sibling' })).toBeNull();
});
