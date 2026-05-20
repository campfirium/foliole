import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
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

it('hides dismissed topic branches only after the view toggle is enabled', () => {
  const nodesById = {
    'dismissed-parent': createTopic({ id: 'dismissed-parent', readingState: 'dismissed', title: 'Dismissed Parent' }),
    'active-child': createTopic({
      id: 'active-child',
      parentNodeId: 'dismissed-parent',
      readingState: 'active',
      title: 'Active Child'
    }),
    'active-topic': createTopic({ id: 'active-topic', readingState: 'active', title: 'Active Topic' })
  };

  render(
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="active-topic"
      itemIds={['dismissed-parent', 'active-child', 'active-topic']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  expect(within(itemColumn).getByRole('treeitem', { name: 'Dismissed Parent' })).toBeInTheDocument();

  fireEvent.click(within(itemColumn).getByRole('button', { name: 'Focus active topics' }));

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.viewHideDismissedTopics)).toBe('true');
  expect(within(itemColumn).queryByRole('treeitem', { name: 'Dismissed Parent' })).toBeNull();
  expect(within(itemColumn).queryByRole('treeitem', { name: 'Active Child' })).toBeNull();
  expect(within(itemColumn).getByRole('treeitem', { name: 'Active Topic' })).toBeInTheDocument();
});

it('keeps title search able to show dismissed matches while the view hides dismissed topics', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.viewHideDismissedTopics, 'true');
  const nodesById = {
    'dismissed-parent': createTopic({ id: 'dismissed-parent', readingState: 'dismissed', title: 'Dismissed Parent' }),
    'active-topic': createTopic({ id: 'active-topic', readingState: 'active', title: 'Active Topic' })
  };

  render(
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

it('shows dismissed ancestors but not dismissed sibling branches for the active review item', () => {
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

  render(
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
