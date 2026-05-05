import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

it('shows create menu labels as Folder, Topic, and Item', () => {
  render(<App />);

  fireEvent.keyDown(screen.getByRole('button', { name: 'Create' }), { key: 'ArrowDown' });

  expect(screen.getByRole('menuitem', { name: 'Create Folder' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Create Topic' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Create Item' })).toBeInTheDocument();
});

it('shows neutral context labels instead of node wording', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-article',
    nodeOrder: ['node-article'],
    nodesById: {
      ...state.nodesById,
      'node-article': createNode({ id: 'node-article', kind: 'topic', title: 'Article node', content: '# Article body' })
    }
  }));
  render(<App />);

  const nodePanel = screen.getByRole('complementary', { name: 'Node list panel' });
  fireEvent.contextMenu(within(nodePanel).getByRole('treeitem', { name: 'Article node' }), {
    clientX: 56,
    clientY: 64
  });

  expect(screen.getByRole('menuitem', { name: 'Merge Highlights' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Paste here *' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: /Node/i })).toBeNull();
});
