import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, getCurrentFolderPanel, getCurrentFolderTreeItem, getTopicListPanel } from './app-smoke.shared';

it('shows only folder creation in the folder panel context menu', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: INBOX_NODE_ID,
    nodeOrder: [INBOX_NODE_ID, 'node-article'],
    nodesById: {
      ...state.nodesById,
      'node-article': createNode({ id: 'node-article', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Article node', content: '# Article body' })
    }
  }));
  render(<App />);

  const tree = within(getTopicListPanel()).getByRole('tree', { name: 'Topic list' });
  fireEvent.contextMenu(tree, { clientX: 80, clientY: 160 });

  expect(screen.getByRole('menuitem', { name: 'Create Folder' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'Create Topic' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'Create Item' })).toBeNull();
});

it('shows only topic and item creation in the current folder context menu', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: INBOX_NODE_ID,
    nodeOrder: [INBOX_NODE_ID, 'node-article'],
    nodesById: {
      ...state.nodesById,
      'node-article': createNode({ id: 'node-article', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Article node', content: '# Article body' })
    }
  }));
  render(<App />);

  const tree = within(getCurrentFolderPanel()).getByRole('tree');
  fireEvent.contextMenu(tree, { clientX: 80, clientY: 160 });

  expect(screen.queryByRole('menuitem', { name: 'Create Folder' })).toBeNull();
  expect(screen.getByRole('menuitem', { name: 'Create Topic' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Create Item' })).toBeInTheDocument();
});

it('shows neutral context labels instead of node wording', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: INBOX_NODE_ID,
    nodeOrder: [INBOX_NODE_ID, 'node-article'],
    nodesById: {
      ...state.nodesById,
      'node-article': createNode({ id: 'node-article', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Article node', content: '# Article body' })
    }
  }));
  render(<App />);

  fireEvent.contextMenu(getCurrentFolderTreeItem('Article node'), {
    clientX: 56,
    clientY: 64
  });

  expect(screen.getByRole('menuitem', { name: 'Merge Highlights' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Paste here' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: /Node/i })).toBeNull();
});
