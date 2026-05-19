import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it } from 'vitest';

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

function rowTitles() {
  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  return within(itemColumn).getAllByRole('treeitem').map((row) => row.textContent);
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

beforeEach(() => {
  window.localStorage.clear();
  useWorkspaceStore.setState((state) => ({
    ...state,
    nodeViewById: {
      'article-a': { scrollTop: 0, selection: null, updatedAt: '2026-04-01T09:00:00.000Z' },
      'article-b': { scrollTop: 0, selection: null, updatedAt: '2026-04-02T09:00:00.000Z' }
    },
    trashedNodeIds: []
  }));
});

it('refreshes the current folder list when last-opened sorting is selected again', () => {
  render(<LastOpenedSortHarness />);

  chooseLastOpenedSort();
  expect(rowTitles()).toEqual(['Latest', 'Earlier']);

  useWorkspaceStore.setState((state) => ({
    ...state,
    nodeViewById: {
      ...state.nodeViewById,
      'article-a': { scrollTop: 0, selection: null, updatedAt: '2026-04-03T09:00:00.000Z' }
    }
  }));
  expect(rowTitles()).toEqual(['Latest', 'Earlier']);

  chooseLastOpenedSort();
  expect(rowTitles()).toEqual(['Earlier', 'Latest']);
});

it('refreshes last-opened order after leaving and returning to a folder', () => {
  render(<LastOpenedFolderSwitchHarness />);

  chooseLastOpenedSort();
  expect(rowTitles()).toEqual(['Latest', 'Earlier']);

  useWorkspaceStore.setState((state) => ({
    ...state,
    nodeViewById: {
      ...state.nodeViewById,
      'article-a': { scrollTop: 0, selection: null, updatedAt: '2026-04-03T09:00:00.000Z' }
    }
  }));
  expect(rowTitles()).toEqual(['Latest', 'Earlier']);

  fireEvent.click(screen.getByRole('button', { name: 'Open folder B' }));
  expect(rowTitles()).toEqual(['Other folder']);

  fireEvent.click(screen.getByRole('button', { name: 'Open folder A' }));
  expect(rowTitles()).toEqual(['Earlier', 'Latest']);
});
