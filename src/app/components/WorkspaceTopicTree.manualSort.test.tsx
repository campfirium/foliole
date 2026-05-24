import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { useWorkspaceStore } from '../../store/workspaceStore';

import { WorkspaceTopicTree } from './WorkspaceTopicTree';

function createTopic(id: string, title: string) {
  return {
    anchorLink: null,
    content: 'Body',
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id,
    kind: 'topic' as const,
    parentNodeId: 'folder-a',
    reveal: null,
    review: null,
    title,
    updatedAt: '2026-04-20T00:00:00.000Z'
  };
}

function createFolder(manualChildOrder: string[] | null) {
  return {
    anchorLink: null,
    content: '',
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: false,
    hasReveal: false,
    id: 'folder-a',
    kind: 'folder' as const,
    manualChildOrder,
    parentNodeId: null,
    reveal: null,
    review: null,
    title: 'Folder A',
    updatedAt: '2026-04-20T00:00:00.000Z'
  };
}

function chooseManualSort() {
  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  fireEvent.keyDown(within(itemColumn).getByRole('button', { name: 'Sort list by Date modified' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Manual' }));
}

function rowTitles() {
  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  return within(itemColumn).getAllByRole('treeitem').map((row) => row.textContent);
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkspaceStore.setState((state) => ({
    ...state,
    nodeViewById: {},
    trashedNodeIds: []
  }));
});

it('uses folder manual topic order in the current folder tree', () => {
  render(
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="topic-a"
      itemIds={['topic-a', 'topic-b', 'topic-c']}
      nodesById={{
        'folder-a': createFolder(['topic-b']),
        'topic-a': createTopic('topic-a', 'Alpha'),
        'topic-b': createTopic('topic-b', 'Beta'),
        'topic-c': createTopic('topic-c', 'Gamma')
      }}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  chooseManualSort();

  expect(rowTitles()).toEqual(['Beta', 'Alpha', 'Gamma']);
});

it('falls back to name order before the current folder has manual topic order', () => {
  render(
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="topic-b"
      itemIds={['topic-b', 'topic-a']}
      nodesById={{
        'folder-a': createFolder(null),
        'topic-a': createTopic('topic-a', 'Alpha'),
        'topic-b': createTopic('topic-b', 'Beta')
      }}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  chooseManualSort();

  expect(rowTitles()).toEqual(['Alpha', 'Beta']);
});
