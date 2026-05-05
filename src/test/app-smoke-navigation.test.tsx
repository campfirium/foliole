import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, mockEditorState } from './app-smoke.shared';

it('supports ctrl/cmd multi-select and shift range select in node list', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2', 'node-3'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({ id: 'node-2', title: 'Node 2', content: '# Node 2' }),
      'node-3': createNode({ id: 'node-3', title: 'Node 3', content: '# Node 3' })
    }
  }));

  render(<App />);

  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
  const node1Button = within(listPanel).getByRole('treeitem', { name: 'Welcome to Foliole Start writing markdown here.' });
  const node2Button = within(listPanel).getByRole('treeitem', { name: 'Node 2' });
  const node3Button = within(listPanel).getByRole('treeitem', { name: 'Node 3' });

  fireEvent.click(node2Button, { ctrlKey: true });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
  expect(node1Button).toHaveAttribute('aria-pressed', 'true');
  expect(node2Button).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(node3Button, { shiftKey: true });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-3');
  expect(node1Button).toHaveAttribute('aria-pressed', 'false');
  expect(node2Button).toHaveAttribute('aria-pressed', 'true');
  expect(node3Button).toHaveAttribute('aria-pressed', 'true');
});

it('supports tree keyboard navigation for node list', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2', 'node-3'],
    nodesById: {
      ...state.nodesById,
      'node-1': createNode({ id: 'node-1', title: 'Root', content: '# Root' }),
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'Child',
        content: '# Child'
      }),
      'node-3': createNode({ id: 'node-3', title: 'Sibling', content: '# Sibling' })
    }
  }));

  render(<App />);

  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
  const rootButton = within(listPanel).getByRole('treeitem', { name: /Root/i });
  const siblingButton = within(listPanel).getByRole('treeitem', { name: /Sibling/i });
  fireEvent.keyDown(rootButton, { key: 'End' });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-3');

  fireEvent.keyDown(siblingButton, { key: 'Home' });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-1');

  fireEvent.click(within(listPanel).getByRole('button', { name: 'Collapse all' }));
  expect(within(listPanel).queryByRole('treeitem', { name: /Child/i })).not.toBeInTheDocument();

  fireEvent.keyDown(rootButton, { key: 'ArrowRight' });
  const childButton = within(listPanel).getByRole('treeitem', { name: /Child/i });

  fireEvent.keyDown(rootButton, { key: 'ArrowRight' });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');

  fireEvent.keyDown(childButton, { key: 'ArrowLeft' });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-1');
});

it('renders breadcrumbs in document header and jumps to ancestor anchor', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-3',
    nodeOrder: ['node-1', 'node-2', 'node-3'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'Parent',
        content: '# Parent <highlight id="1">Needle</highlight id="1">'
      }),
      'node-3': createNode({
        id: 'node-3',
        parentNodeId: 'node-2',
        title: 'Child',
        content: '# Child',
        anchorLink: { id: '1', kind: 'highlight' }
      })
    }
  }));

  render(<App />);

  const nav = screen.getByRole('navigation', { name: 'Node breadcrumbs' });
  fireEvent.click(within(nav).getByRole('button', { name: 'Parent' }));
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
  const expectedFrom = '# Parent <highlight id="1">Needle</highlight id="1">'.indexOf('Needle');
  expect(mockEditorState.selectionFrom).toBe(expectedFrom);
  expect(mockEditorState.selectionTo).toBe(expectedFrom + 'Needle'.length);
});

it('supports toolbar parent and navigation history actions', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-3',
    nodeOrder: ['node-1', 'node-2', 'node-3'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'Parent',
        content: '# Parent <highlight id="1">Needle</highlight id="1">'
      }),
      'node-3': createNode({
        id: 'node-3',
        parentNodeId: 'node-2',
        title: 'Child',
        content: '# Child',
        anchorLink: { id: '1', kind: 'highlight' }
      })
    },
    navigation: { backStack: [], forwardStack: [] }
  }));

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Go to parent node' }));
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-3');
  fireEvent.click(screen.getByRole('button', { name: 'Go forward' }));
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
});

it('expands compact breadcrumbs when clicking ellipsis', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-5',
    nodeOrder: ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({ id: 'node-2', parentNodeId: 'node-1', title: 'N2', content: '# N2' }),
      'node-3': createNode({ id: 'node-3', parentNodeId: 'node-2', title: 'N3', content: '# N3' }),
      'node-4': createNode({ id: 'node-4', parentNodeId: 'node-3', title: 'N4', content: '# N4' }),
      'node-5': createNode({ id: 'node-5', parentNodeId: 'node-4', title: 'N5', content: '# N5' })
    }
  }));

  render(<App />);

  const nav = screen.getByRole('navigation', { name: 'Node breadcrumbs' });
  expect(within(nav).queryByRole('button', { name: 'N2' })).not.toBeInTheDocument();
  fireEvent.click(within(nav).getByRole('button', { name: 'Expand breadcrumb path' }));
  expect(within(nav).getByRole('button', { name: 'N2' })).toBeInTheDocument();
});
