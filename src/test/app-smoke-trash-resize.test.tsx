import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { DOCUMENT_WIDTH_DEFAULT, LIST_WIDTH_DEFAULT, useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

it('restores and permanently deletes nodes from trash context menu actions', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({ id: 'node-2', parentNodeId: 'node-1', title: 'Child', content: '# Child content' })
    }
  }));

  render(<App />);
  const nodePanel = screen.getByRole('complementary', { name: 'Node list panel' });
  fireEvent.contextMenu(within(nodePanel).getByRole('treeitem', { name: 'Child' }), { clientX: 56, clientY: 64 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Node' }));

  fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
  fireEvent.contextMenu(within(nodePanel).getByRole('treeitem', { name: 'Child' }), { clientX: 56, clientY: 64 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Restore' }));
  expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain('node-2');

  fireEvent.click(within(nodePanel).getByRole('button', { name: 'Nodes' }));
  fireEvent.contextMenu(within(nodePanel).getByRole('treeitem', { name: 'Child' }), { clientX: 56, clientY: 64 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Node' }));
  fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
  fireEvent.contextMenu(within(nodePanel).getByRole('treeitem', { name: 'Child' }), { clientX: 56, clientY: 64 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Permanently' }));
  expect(useWorkspaceStore.getState().nodesById['node-2']).toBeUndefined();
});

it('supports multi-select permanent delete inside trash', () => {
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
  const nodePanel = screen.getByRole('complementary', { name: 'Node list panel' });
  fireEvent.contextMenu(within(nodePanel).getByRole('treeitem', { name: 'Node 2' }), { clientX: 56, clientY: 64 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Node' }));
  fireEvent.contextMenu(within(nodePanel).getByRole('treeitem', { name: 'Node 3' }), { clientX: 56, clientY: 64 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Node' }));

  fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
  const trashedNode2 = within(nodePanel).getByRole('treeitem', { name: 'Node 2' });
  const trashedNode3 = within(nodePanel).getByRole('treeitem', { name: 'Node 3' });
  fireEvent.click(trashedNode2);
  fireEvent.click(trashedNode3, { ctrlKey: true });
  fireEvent.contextMenu(trashedNode3, { clientX: 56, clientY: 64 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Permanently' }));

  const workspace = useWorkspaceStore.getState();
  expect(workspace.nodesById['node-2']).toBeUndefined();
  expect(workspace.nodesById['node-3']).toBeUndefined();
});

it('empties all trash items from trash header action', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({ id: 'node-2', title: 'Node 2', content: '# Node 2' })
    }
  }));

  render(<App />);
  const nodePanel = screen.getByRole('complementary', { name: 'Node list panel' });
  fireEvent.contextMenu(within(nodePanel).getByRole('treeitem', { name: 'Node 2' }), { clientX: 56, clientY: 64 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Node' }));
  fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
  fireEvent.click(within(nodePanel).getByRole('button', { name: 'Empty' }));

  const workspace = useWorkspaceStore.getState();
  expect(workspace.nodesById['node-2']).toBeUndefined();
  expect(workspace.trashedNodeIds).toEqual([]);
});

it('does not render save badge in document header', () => {
  render(<App />);

  expect(screen.queryByText('Not saved yet.')).not.toBeInTheDocument();
  expect(screen.queryByText('Saving...')).not.toBeInTheDocument();
  expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
});

it('updates persisted document width from side handle drag', () => {
  render(<App />);
  const rightHandle = screen.getByRole('separator', { name: 'Resize document width from right' });
  fireEvent.mouseDown(rightHandle, { clientX: 200 });
  fireEvent.mouseMove(window, { clientX: 280 });
  fireEvent.mouseUp(window);
  expect(useWorkspaceStore.getState().layout.documentMaxWidth).toBeGreaterThan(DOCUMENT_WIDTH_DEFAULT);
});

it('supports keyboard resize on list splitter and reset by double click', () => {
  render(<App />);
  const splitter = screen.getByRole('separator', { name: 'Resize node list' });
  fireEvent.keyDown(splitter, { key: 'ArrowLeft' });

  expect(useWorkspaceStore.getState().layout.listWidth).toBeLessThan(LIST_WIDTH_DEFAULT);
  fireEvent.doubleClick(splitter);
  expect(useWorkspaceStore.getState().layout.listWidth).toBe(LIST_WIDTH_DEFAULT);
});

it('resets document width by double click handle', () => {
  useWorkspaceStore.getState().setDocumentMaxWidth(1400);
  render(<App />);
  const rightHandle = screen.getByRole('separator', { name: 'Resize document width from right' });
  fireEvent.doubleClick(rightHandle);
  expect(useWorkspaceStore.getState().layout.documentMaxWidth).toBe(DOCUMENT_WIDTH_DEFAULT);
});
