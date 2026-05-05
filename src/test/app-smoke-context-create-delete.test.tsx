import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, mockEditorState } from './app-smoke.shared';

it('creates highlight node from editor context menu without leaving current node', () => {
  render(<App />);
  const editor = screen.getByLabelText('Prompt editor');
  mockEditorState.selectionFrom = 2;
  mockEditorState.selectionTo = 9;

  fireEvent.contextMenu(editor, { clientX: 40, clientY: 48 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Highlight' }));

  const workspace = useWorkspaceStore.getState();
  expect(workspace.activeNodeId).toBe('node-1');
  const createdNodeId = workspace.nodeOrder.find((nodeId) => nodeId !== 'node-1');
  expect(createdNodeId).toBeTruthy();
  if (!createdNodeId) {
    throw new Error('expected a child node');
  }
  expect(workspace.nodesById[createdNodeId]?.parentNodeId).toBe('node-1');
  expect(workspace.nodesById[createdNodeId]?.title).toBe('Welcome');
  expect(workspace.nodesById[createdNodeId]?.content).toBe('Welcome');
});

it('creates cloze node from editor context menu without leaving current node', () => {
  render(<App />);
  const editor = screen.getByLabelText('Prompt editor');
  mockEditorState.selectionFrom = 2;
  mockEditorState.selectionTo = 9;

  fireEvent.contextMenu(editor, { clientX: 40, clientY: 48 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Cloze' }));

  const workspace = useWorkspaceStore.getState();
  const createdNodeId = workspace.nodeOrder.find((nodeId) => nodeId !== 'node-1');
  expect(createdNodeId).toBeTruthy();
  if (!createdNodeId) {
    throw new Error('expected a child node');
  }
  expect(workspace.nodesById[createdNodeId]?.parentNodeId).toBe('node-1');
  expect(workspace.nodesById[createdNodeId]?.title).toBe('[...] to Foliole Start writing markdown here.');
  expect(workspace.nodesById[createdNodeId]?.reveal).toBe('Welcome');
});

it('creates cloze child content without inheriting anchor tags from parent', () => {
  useWorkspaceStore
    .getState()
    .updateNodeContent('node-1', '# A <highlight id="1">B</highlight id="1"> C');

  render(<App />);
  const editor = screen.getByLabelText('Prompt editor');
  const content = mockEditorState.content;
  const start = content.lastIndexOf('C');
  mockEditorState.selectionFrom = start;
  mockEditorState.selectionTo = start + 1;

  fireEvent.contextMenu(editor, { clientX: 40, clientY: 48 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Cloze' }));

  const workspace = useWorkspaceStore.getState();
  const createdNodeId = workspace.nodeOrder.find((nodeId) => nodeId !== 'node-1');
  expect(createdNodeId).toBeTruthy();
  if (!createdNodeId) {
    throw new Error('expected a child node');
  }
  expect(workspace.nodesById[createdNodeId]?.content).toBe('# A B [...]');
  expect(workspace.nodesById[createdNodeId]?.content).not.toContain('<highlight');
});

it('deletes a node from node-list context menu', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({ id: 'node-2', parentNodeId: 'node-1', title: 'Child', content: '# Child' })
    }
  }));

  render(<App />);
  const nodePanel = screen.getByRole('complementary', { name: 'Node list panel' });
  fireEvent.contextMenu(within(nodePanel).getByRole('treeitem', { name: 'Child' }), {
    clientX: 56,
    clientY: 64
  });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Node' }));

  const workspace = useWorkspaceStore.getState();
  expect(workspace.nodesById['node-2']).toBeDefined();
  expect(workspace.trashedNodeIds).toContain('node-2');
  expect(workspace.activeNodeId).toBe('node-1');
});

it('deletes all selected nodes from node-list context menu', () => {
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
  const node2Button = within(nodePanel).getByRole('treeitem', { name: 'Node 2' });
  const node3Button = within(nodePanel).getByRole('treeitem', { name: 'Node 3' });

  fireEvent.click(node2Button);
  fireEvent.click(node3Button, { ctrlKey: true });
  fireEvent.contextMenu(node3Button, { clientX: 56, clientY: 64 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Node' }));

  const workspace = useWorkspaceStore.getState();
  expect(workspace.trashedNodeIds).toEqual(expect.arrayContaining(['node-2', 'node-3']));
  expect(workspace.nodeOrder).toEqual(['node-1', 'node-2', 'node-3']);
  expect(workspace.activeNodeId).toBe('node-1');
});
