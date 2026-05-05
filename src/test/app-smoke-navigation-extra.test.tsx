import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, mockEditorState } from './app-smoke.shared';

function createTextAnchorLink(id: string, originalText: string, from: number) {
  return {
    id,
    kind: 'highlight' as const,
    locator: {
      from,
      originalText,
      to: from + originalText.length
    }
  };
}

it('reveals document highlights from the right sidebar list', () => {
  const parentContent = '# Parent Needle\n\nSecond mark';
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2', 'node-3', 'node-4'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({ id: 'node-2', title: 'Parent', content: parentContent }),
      'node-3': createNode({
        id: 'node-3',
        parentNodeId: 'node-2',
        title: 'Needle highlight',
        content: 'Needle',
        anchorLink: createTextAnchorLink('1', 'Needle', parentContent.indexOf('Needle'))
      }),
      'node-4': createNode({
        id: 'node-4',
        parentNodeId: 'node-2',
        title: 'Second mark highlight',
        content: 'Second mark',
        anchorLink: createTextAnchorLink('2', 'Second mark', parentContent.indexOf('Second mark'))
      })
    }
  }));

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Highlights panel' }));
  fireEvent.click(screen.getByRole('button', { name: /Second mark/i }));

  const expectedFrom = parentContent.indexOf('Second mark');
  return waitFor(() => {
    expect(mockEditorState.selectionFrom).toBe(expectedFrom);
    expect(mockEditorState.selectionTo).toBe(expectedFrom);
  });
});

it('renders the full ancestor path and abbreviates article descendants', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-7',
    nodeOrder: ['node-1', 'node-2', 'node-3', 'node-4', 'node-5', 'node-6', 'node-7'],
    nodesById: {
      ...state.nodesById,
      'node-1': createNode({ id: 'node-1', kind: 'folder', parentNodeId: null, title: 'Inbox', content: '' }),
      'node-2': createNode({ id: 'node-2', kind: 'topic', parentNodeId: 'node-1', title: 'Article', content: '# Article' }),
      'node-3': createNode({ id: 'node-3', kind: 'topic', parentNodeId: 'node-2', title: '标注节点标题', content: '# Nested 1' }),
      'node-4': createNode({ id: 'node-4', kind: 'item', parentNodeId: 'node-3', title: '挖空卡片标题', content: '# Nested 2' }),
      'node-5': createNode({ id: 'node-5', kind: 'item', parentNodeId: 'node-4', title: '当前父级', content: '# Parent' }),
      'node-6': createNode({ id: 'node-6', kind: 'item', parentNodeId: 'node-5', title: '当前节点', content: '# Current' }),
      'node-7': createNode({ id: 'node-7', kind: 'item', parentNodeId: 'node-6', title: '最终节点', content: '# Final' })
    }
  }));

  render(<App />);

  const nav = screen.getByRole('navigation', { name: 'Node breadcrumbs' });
  expect(within(nav).getByRole('button', { name: 'Inbox' })).toBeInTheDocument();
  expect(within(nav).getByRole('button', { name: 'Article' })).toBeInTheDocument();
  expect(within(nav).getByRole('button', { name: '标注...' })).toBeInTheDocument();
  expect(within(nav).getByRole('button', { name: '挖空...' })).toBeInTheDocument();
  expect(within(nav).getAllByRole('button', { name: '当前...' })).toHaveLength(2);
  expect(within(nav).queryByRole('button', { name: '最终节点' })).not.toBeInTheDocument();
});
