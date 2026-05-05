import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

it('shows total descendant counts at the end of node rows', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'root',
    nodeOrder: ['root', 'child-1', 'grandchild', 'child-2'],
    nodesById: {
      ...state.nodesById,
      root: createNode({ id: 'root', title: 'Root', content: '# Root' }),
      'child-1': createNode({
        id: 'child-1',
        parentNodeId: 'root',
        title: 'Child 1',
        content: '# Child 1'
      }),
      grandchild: createNode({
        id: 'grandchild',
        parentNodeId: 'child-1',
        title: 'Grandchild',
        content: '# Grandchild'
      }),
      'child-2': createNode({
        id: 'child-2',
        parentNodeId: 'root',
        title: 'Child 2',
        content: '# Child 2'
      })
    }
  }));

  render(<App />);

  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
  fireEvent.click(within(listPanel).getByRole('button', { name: 'Expand Child 1' }));

  expect(within(listPanel).getByRole('treeitem', { name: 'Root' })).toHaveTextContent('Root(3)');
  expect(within(listPanel).getByRole('treeitem', { name: 'Child 1' })).toHaveTextContent('Child 1(1)');
  expect(within(listPanel).getByRole('treeitem', { name: 'Grandchild' })).toHaveTextContent('Grandchild(0)');
  expect(within(listPanel).getByRole('treeitem', { name: 'Child 2' })).toHaveTextContent('Child 2(0)');
});
