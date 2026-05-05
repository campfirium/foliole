import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

it('shows folders in the left tree and direct children in the adjacent list', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'folder-projects',
    nodeOrder: ['folder-projects', 'folder-research', 'topic-overview', 'item-card'],
    nodesById: {
      ...state.nodesById,
      'folder-projects': createNode({
        id: 'folder-projects',
        kind: 'folder',
        title: 'Projects',
        content: ''
      }),
      'folder-research': createNode({
        id: 'folder-research',
        kind: 'folder',
        parentNodeId: 'folder-projects',
        title: 'Research',
        content: ''
      }),
      'topic-overview': createNode({
        id: 'topic-overview',
        kind: 'topic',
        parentNodeId: 'folder-projects',
        title: 'Overview',
        content: '# Overview'
      }),
      'item-card': createNode({
        id: 'item-card',
        kind: 'item',
        parentNodeId: 'folder-projects',
        title: 'Key Card',
        content: 'Prompt',
        reveal: 'Answer'
      })
    }
  }));

  render(<App />);

  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
  expect(within(listPanel).getByRole('treeitem', { name: 'Projects' })).toBeInTheDocument();
  expect(within(listPanel).getByRole('treeitem', { name: 'Research' })).toBeInTheDocument();
  expect(within(listPanel).queryByRole('treeitem', { name: 'Overview' })).not.toBeInTheDocument();

  const currentFolderPanel = screen.getByRole('complementary', { name: 'Current folder contents' });
  expect(within(currentFolderPanel).getByRole('treeitem', { name: 'Research' })).toBeInTheDocument();
  expect(within(currentFolderPanel).getByRole('treeitem', { name: 'Overview' })).toBeInTheDocument();
  expect(within(currentFolderPanel).getByRole('treeitem', { name: 'Key Card' })).toBeInTheDocument();
});
