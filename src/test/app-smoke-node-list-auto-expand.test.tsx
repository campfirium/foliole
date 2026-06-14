import { act, fireEvent, render, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { resetNodeListCollapseSessionForTest } from '../features/nodes/components/nodeListCollapseSession';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, getCurrentFolderPanel, getTopicListPanel } from './app-smoke.shared';

const RELEASE_GATE_TEST_TIMEOUT_MS = 15_000;

beforeEach(() => {
  resetNodeListCollapseSessionForTest();
});

function buildAutoExpandNodes(includeSecondFolder = false) {
  return {
    'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A', content: '# Folder A' }),
    'article-a': createNode({
      id: 'article-a',
      parentNodeId: 'folder-a',
      title: 'Article A',
      content: '# Article A'
    }),
    'highlight-a1': createNode({
      id: 'highlight-a1',
      parentNodeId: 'article-a',
      title: 'Highlight A1',
      content: 'Highlight A1',
      anchorLink: { id: 'a1', kind: 'highlight' }
    }),
    'highlight-a2': createNode({
      id: 'highlight-a2',
      parentNodeId: 'article-a',
      title: 'Highlight A2',
      content: 'Highlight A2',
      anchorLink: { id: 'a2', kind: 'highlight' }
    }),
    'article-b': createNode({
      id: 'article-b',
      parentNodeId: 'folder-a',
      title: 'Article B',
      content: '# Article B'
    }),
    'highlight-b1': createNode({
      id: 'highlight-b1',
      parentNodeId: 'article-b',
      title: 'Highlight B1',
      content: 'Highlight B1',
      anchorLink: { id: 'b1', kind: 'highlight' }
    }),
    ...(includeSecondFolder
      ? {
          'folder-b': createNode({ id: 'folder-b', kind: 'folder', title: 'Folder B', content: '# Folder B' }),
          'article-c': createNode({
            id: 'article-c',
            parentNodeId: 'folder-b',
            title: 'Article C',
            content: '# Article C'
          }),
          'highlight-c1': createNode({
            id: 'highlight-c1',
            parentNodeId: 'article-c',
            title: 'Highlight C1',
            content: 'Highlight C1',
            anchorLink: { id: 'c1', kind: 'highlight' }
          })
        }
      : {})
  };
}

function seedAutoExpandState(includeSecondFolder = false) {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'highlight-a2',
    nodeOrder: [
      'folder-a',
      'article-a',
      'highlight-a1',
      'highlight-a2',
      'article-b',
      'highlight-b1',
      ...(includeSecondFolder ? ['folder-b', 'article-c', 'highlight-c1'] : [])
    ],
    nodesById: {
      ...state.nodesById,
      ...buildAutoExpandNodes(includeSecondFolder)
    }
  }));
}

it('keeps branches collapsed by default without auto-expanding the active path', () => {
  seedAutoExpandState(true);

  render(<App />);

  const listPanel = getTopicListPanel();
  const currentFolderPanel = getCurrentFolderPanel();
  expect(within(listPanel).getByRole('treeitem', { name: 'Folder A' })).toBeInTheDocument();
  expect(within(currentFolderPanel).getByRole('treeitem', { name: 'Article A' })).toBeInTheDocument();
  expect(within(currentFolderPanel).queryByRole('treeitem', { name: 'Highlight A1' })).not.toBeInTheDocument();
  expect(within(currentFolderPanel).queryByRole('treeitem', { name: 'Highlight A2' })).not.toBeInTheDocument();
  expect(within(currentFolderPanel).getByRole('treeitem', { name: 'Article B' })).toBeInTheDocument();
  expect(within(currentFolderPanel).queryByRole('treeitem', { name: 'Highlight B1' })).not.toBeInTheDocument();
  expect(within(listPanel).getByRole('treeitem', { name: 'Folder B' })).toBeInTheDocument();
  fireEvent.click(within(listPanel).getByRole('treeitem', { name: 'Folder B' }));
  act(() => {
    useWorkspaceStore.getState().setActiveNode('folder-b');
  });
  expect(within(getCurrentFolderPanel()).getByRole('treeitem', { name: 'Article C' })).toBeInTheDocument();
  expect(within(getCurrentFolderPanel()).queryByRole('treeitem', { name: 'Highlight C1' })).not.toBeInTheDocument();
}, RELEASE_GATE_TEST_TIMEOUT_MS);

it('keeps collapsed branches closed after focus moves', () => {
  seedAutoExpandState();

  render(<App />);

  const listPanel = getCurrentFolderPanel();
  expect(within(listPanel).queryByRole('treeitem', { name: 'Highlight A1' })).not.toBeInTheDocument();
  expect(within(listPanel).queryByRole('treeitem', { name: 'Highlight A2' })).not.toBeInTheDocument();

  fireEvent.click(within(listPanel).getByRole('treeitem', { name: 'Article B' }));
  act(() => {
    useWorkspaceStore.getState().setActiveNode('article-b');
  });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('article-b');
  expect(within(listPanel).queryByRole('treeitem', { name: 'Highlight A1' })).not.toBeInTheDocument();
  expect(within(listPanel).queryByRole('treeitem', { name: 'Highlight B1' })).not.toBeInTheDocument();
});
