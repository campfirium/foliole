import { act, fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { WorkspaceTopicTree } from './WorkspaceTopicTree';

function createNode(
  id: string,
  title: string,
  options: {
    anchorFrom?: number;
    parentNodeId?: string | null;
  } = {}
) {
  return {
    anchorLink:
      options.anchorFrom === undefined
        ? null
        : {
            id: `${id}-anchor`,
            kind: 'highlight' as const,
            locator: { from: options.anchorFrom, originalText: title, to: options.anchorFrom + title.length }
          },
    content: 'Body',
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id,
    kind: 'topic' as const,
    parentNodeId: options.parentNodeId ?? null,
    reveal: null,
    review: null,
    title,
    updatedAt: '2026-04-20T00:00:00.000Z'
  };
}

function rowTitles() {
  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  return within(itemColumn).getAllByRole('treeitem').map((row) => row.textContent);
}

function rowNodeIds() {
  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  return within(itemColumn).getAllByRole('treeitem').map((row) => row.getAttribute('data-node-id'));
}

function StoreBackedLastOpenedHarness() {
  const activeNodeId = useWorkspaceStore((state) => state.activeNodeId);
  const nodesById = {
    'article-a': createNode('article-a', 'Opened earlier'),
    'article-b': createNode('article-b', 'Opened latest'),
    'article-c': createNode('article-c', 'Newly opened')
  };

  return (
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId={activeNodeId}
      itemIds={['article-a', 'article-b', 'article-c']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={(nodeId) => useWorkspaceStore.getState().openNode(nodeId)}
    />
  );
}

function chooseLastOpenedSort() {
  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  fireEvent.keyDown(within(itemColumn).getByRole('button', { name: /Sort list by / }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Last opened' }));
}

function LastOpenedSortHarness() {
  const [activeNodeId, setActiveNodeId] = useState<string | null>('article-a');
  const nodesById = {
    'article-a': createNode('article-a', 'Earlier'),
    'article-b': createNode('article-b', 'Latest')
  };

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

function LastOpenedFolderSwitchHarness() {
  const [activeFolderId, setActiveFolderId] = useState('folder-a');
  const [activeNodeId, setActiveNodeId] = useState<string | null>('article-a');
  const nodesById = {
    'article-a': createNode('article-a', 'Earlier'),
    'article-b': createNode('article-b', 'Latest'),
    'folder-b-topic': createNode('folder-b-topic', 'Other folder')
  };
  const itemIds = activeFolderId === 'folder-a' ? ['article-a', 'article-b'] : ['folder-b-topic'];

  return (
    <>
      <button
        onClick={() => {
          setActiveFolderId('folder-b');
          setActiveNodeId('folder-b-topic');
        }}
        type="button"
      >
        Open folder B
      </button>
      <button
        onClick={() => {
          setActiveFolderId('folder-a');
          setActiveNodeId('article-a');
        }}
        type="button"
      >
        Open folder A
      </button>
      <WorkspaceTopicTree
        activeFolderId={activeFolderId}
        activeNodeId={activeNodeId}
        itemIds={itemIds}
        nodesById={nodesById}
        onOpenMoveToNode={() => undefined}
        onSelectNode={setActiveNodeId}
      />
    </>
  );
}

function LastOpenedDerivedChildrenHarness() {
  const [activeNodeId, setActiveNodeId] = useState<string | null>('article-a-upper');
  const nodesById = {
    'article-a': createNode('article-a', 'Earlier'),
    'article-b': createNode('article-b', 'Latest'),
    'article-a-upper': createNode('article-a-upper', 'Upper child', { anchorFrom: 5, parentNodeId: 'article-a' }),
    'article-a-lower': createNode('article-a-lower', 'Lower child', { anchorFrom: 20, parentNodeId: 'article-a' })
  };

  return (
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId={activeNodeId}
      forceVisibleNodeId="article-a-upper"
      itemIds={['article-a', 'article-b', 'article-a-lower', 'article-a-upper']}
      nodesById={nodesById}
      onOpenMoveToNode={() => undefined}
      onSelectNode={setActiveNodeId}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkspaceStore.setState((state) => ({
    ...state,
    nodeOpenStateById: {
      'article-a': { lastOpenedAt: '2026-04-01T09:00:00.000Z', nodeId: 'article-a' },
      'article-b': { lastOpenedAt: '2026-04-02T09:00:00.000Z', nodeId: 'article-b' },
      'article-a-lower': { lastOpenedAt: '2026-04-04T09:00:00.000Z', nodeId: 'article-a-lower' },
      'article-a-upper': { lastOpenedAt: '2026-04-03T09:00:00.000Z', nodeId: 'article-a-upper' }
    },
    trashedNodeIds: []
  }));
});

it('keeps the current folder list stable when last-opened timestamps change', () => {
  renderWithLocalization(<LastOpenedSortHarness />);

  chooseLastOpenedSort();
  expect(rowTitles()).toEqual(['Latest', 'Earlier']);

  act(() => {
    useWorkspaceStore.setState((state) => ({
      ...state,
      nodeOpenStateById: {
        ...state.nodeOpenStateById,
        'article-a': { lastOpenedAt: '2026-04-03T09:00:00.000Z', nodeId: 'article-a' }
      }
    }));
  });
  expect(rowTitles()).toEqual(['Latest', 'Earlier']);
});

it('does not move a newly opened topic to the top while the folder stays open', () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    activeNodeId: 'article-a',
    nodeOrder: ['article-a', 'article-b', 'article-c'],
    nodeOpenStateById: {
      'article-a': { lastOpenedAt: '2026-04-01T09:00:00.000Z', nodeId: 'article-a' },
      'article-b': { lastOpenedAt: '2026-04-02T09:00:00.000Z', nodeId: 'article-b' }
    },
    nodesById: {
      'article-a': createNode('article-a', 'Opened earlier'),
      'article-b': createNode('article-b', 'Opened latest'),
      'article-c': createNode('article-c', 'Newly opened')
    },
    trashedNodeIds: []
  }));
  renderWithLocalization(<StoreBackedLastOpenedHarness />);

  chooseLastOpenedSort();
  expect(rowTitles()).toEqual(['Opened latest', 'Opened earlier', 'Newly opened']);

  fireEvent.click(screen.getByRole('treeitem', { name: /Newly opened/ }));

  expect(rowTitles()).toEqual(['Opened latest', 'Opened earlier', 'Newly opened']);
});

it('keeps the refreshed last-opened order after leaving and returning to a folder', () => {
  renderWithLocalization(<LastOpenedFolderSwitchHarness />);

  chooseLastOpenedSort();
  expect(rowTitles()).toEqual(['Latest', 'Earlier']);

  act(() => {
    useWorkspaceStore.setState((state) => ({
      ...state,
      nodeOpenStateById: {
        ...state.nodeOpenStateById,
        'article-a': { lastOpenedAt: '2026-04-03T09:00:00.000Z', nodeId: 'article-a' }
      }
    }));
  });
  expect(rowTitles()).toEqual(['Latest', 'Earlier']);

  fireEvent.click(screen.getByRole('button', { name: 'Open folder B' }));
  expect(rowTitles()).toEqual(['Other folder']);

  fireEvent.click(screen.getByRole('button', { name: 'Open folder A' }));
  expect(rowTitles()).toEqual(['Earlier', 'Latest']);
});

it('keeps derived children independent from last-opened sorting', () => {
  renderWithLocalization(<LastOpenedDerivedChildrenHarness />);

  chooseLastOpenedSort();

  expect(rowNodeIds()).toEqual(['article-b', 'article-a', 'article-a-upper', 'article-a-lower']);
});
