import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { beforeEach, expect, it } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { WorkspaceTopicTree } from './WorkspaceTopicTree';

function createNode(id: string, title: string) {
  return {
    anchorLink: null,
    content: 'Body',
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id,
    kind: 'topic' as const,
    parentNodeId: null,
    reveal: null,
    review: null,
    title,
    updatedAt: '2026-04-20T00:00:00.000Z'
  };
}

function WorkspaceTopicTreeAutoScrollHarness() {
  const [activeNodeId, setActiveNodeId] = useState<string | null>('article-a');
  const nodesById = {
    'article-a': createNode('article-a', 'React Notes'),
    'article-b': createNode('article-b', 'Vue Notes')
  };

  useEffect(() => {
    setActiveNodeId('article-b');
  }, []);

  return (
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId={activeNodeId}
      itemIds={['article-a', 'article-b']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={setActiveNodeId}
    />
  );
}

function WorkspaceTopicTreeAnchorFocusHarness() {
  const nodesById = {
    article: createNode('article', 'Long Article'),
    'highlight-a': {
      ...createNode('highlight-a', 'First highlight'),
      anchorLink: {
        id: 'anchor-a',
        kind: 'highlight' as const,
        locator: { from: 40, originalText: 'matched entry', to: 80 }
      },
      parentNodeId: 'article'
    },
    'highlight-b': {
      ...createNode('highlight-b', 'Second highlight'),
      anchorLink: {
        id: 'anchor-b',
        kind: 'highlight' as const,
        locator: { from: 120, originalText: 'other entry', to: 150 }
      },
      parentNodeId: 'article'
    }
  };

  return (
    <WorkspaceTopicTree
      activeFolderId="article"
      activeNodeId="article"
      itemIds={['highlight-a', 'highlight-b']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );
}

function WorkspaceTopicTreeSortedAnchorFocusHarness() {
  const nodesById = {
    article: createNode('article', 'Long Article'),
    'highlight-target': {
      ...createNode('highlight-target', 'Alpha matched highlight'),
      anchorLink: {
        id: 'anchor-target',
        kind: 'highlight' as const,
        locator: { from: 40, originalText: 'matched entry', to: 80 }
      },
      parentNodeId: 'article',
      updatedAt: '2026-04-20T00:00:00.000Z'
    },
    'highlight-other': {
      ...createNode('highlight-other', 'Zulu other highlight'),
      anchorLink: {
        id: 'anchor-other',
        kind: 'highlight' as const,
        locator: { from: 120, originalText: 'other entry', to: 150 }
      },
      parentNodeId: 'article',
      updatedAt: '2026-04-21T00:00:00.000Z'
    }
  };

  return (
    <WorkspaceTopicTree
      activeFolderId="article"
      activeNodeId="article"
      itemIds={['highlight-target', 'highlight-other']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkspaceStore.setState((state) => ({
    ...state,
    nodeViewById: {},
    trashedNodeIds: []
  }));
});

it('scrolls the current folder item column to the externally selected node', async () => {
  renderWithLocalization(<WorkspaceTopicTreeAutoScrollHarness />);

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  const scrollContainer = itemColumn.querySelector('.app-scrollbar') as HTMLDivElement;
  const vueRow = within(itemColumn).getByRole('treeitem', { name: 'Vue Notes' });

  Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 100 });
  Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(vueRow, 'offsetTop', { configurable: true, value: 180 });

  await waitFor(() => expect(scrollContainer.scrollTop).toBe(142));
});

it('scrolls the current folder item column to the anchor-backed entry for an active article selection', async () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    nodeViewById: {
      article: {
        scrollTop: 0,
        selection: { from: 52, to: 65 }
      }
    }
  }));

  renderWithLocalization(<WorkspaceTopicTreeAnchorFocusHarness />);

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  const scrollContainer = itemColumn.querySelector('.app-scrollbar') as HTMLDivElement;
  const highlightRow = within(itemColumn).getByRole('treeitem', { name: 'First highlight' });

  Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 100 });
  Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(highlightRow, 'offsetTop', { configurable: true, value: 240 });

  await waitFor(() => expect(scrollContainer.scrollTop).toBe(202));
  expect(highlightRow).toHaveAttribute('aria-current', 'page');
});

it('reruns anchor-backed item column scrolling when sorting changes the focused row index', async () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    nodeViewById: {
      article: {
        scrollTop: 0,
        selection: { from: 52, to: 65 }
      }
    }
  }));

  renderWithLocalization(<WorkspaceTopicTreeSortedAnchorFocusHarness />);

  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  const scrollContainer = itemColumn.querySelector('.app-scrollbar') as HTMLDivElement;

  expect(within(itemColumn).getAllByRole('treeitem').map((row) => row.textContent)).toEqual([
    'Zulu other highlight',
    'Alpha matched highlight'
  ]);

  fireEvent.keyDown(within(itemColumn).getByRole('button', { name: 'Sort list by Date modified' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Name' }));

  const targetRow = within(itemColumn).getByRole('treeitem', { name: 'Alpha matched highlight' });
  Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 100 });
  Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(targetRow, 'offsetTop', { configurable: true, value: 260 });
  scrollContainer.scrollTop = 0;

  expect(within(itemColumn).getAllByRole('treeitem').map((row) => row.textContent)).toEqual([
    'Alpha matched highlight',
    'Zulu other highlight'
  ]);
  await waitFor(() => expect(scrollContainer.scrollTop).toBe(222));
  expect(targetRow).toHaveAttribute('aria-current', 'page');
});
