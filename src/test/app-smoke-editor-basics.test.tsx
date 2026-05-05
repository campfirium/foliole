import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

it('creates a root node on first editor change when workspace has no active node', () => {
  useWorkspaceStore.setState({ activeNodeId: null, nodeOrder: [], nodesById: {} });

  render(<App />);
  fireEvent.change(screen.getByTestId('editor-value'), {
    target: { value: 'Pasted from clipboard' }
  });

  const workspace = useWorkspaceStore.getState();
  expect(workspace.activeNodeId).toBeTruthy();
  if (!workspace.activeNodeId) {
    throw new Error('expected active node to be created');
  }
  expect(workspace.nodeOrder).toHaveLength(1);
  expect(workspace.nodesById[workspace.activeNodeId]?.content).toBe('Pasted from clipboard');
});

it('creates a new empty note from node panel action', () => {
  useWorkspaceStore.setState({ activeNodeId: null, nodeOrder: [], nodesById: {} });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'New' }));

  const workspace = useWorkspaceStore.getState();
  expect(workspace.activeNodeId).toBeTruthy();
  if (!workspace.activeNodeId) {
    throw new Error('expected active node to be created');
  }
  expect(workspace.nodeOrder).toHaveLength(1);
  expect(workspace.nodesById[workspace.activeNodeId]?.content).toBe('');
  expect(workspace.nodesById[workspace.activeNodeId]?.title).toBe('Untitled');
});

it('keeps first note content unchanged when editing a newly created note', () => {
  render(<App />);
  const originalFirstNodeContent = useWorkspaceStore.getState().nodesById['node-1']?.content;

  fireEvent.click(screen.getByRole('button', { name: 'New' }));

  const workspaceAfterCreate = useWorkspaceStore.getState();
  const newNodeId = workspaceAfterCreate.activeNodeId;
  expect(newNodeId).toBeTruthy();
  if (!newNodeId) {
    throw new Error('expected new active node');
  }

  fireEvent.change(screen.getByTestId('editor-value'), {
    target: { value: 'My second note content' }
  });

  const workspaceAfterEdit = useWorkspaceStore.getState();
  expect(workspaceAfterEdit.nodesById['node-1']?.content).toBe(originalFirstNodeContent);
  expect(workspaceAfterEdit.nodesById[newNodeId]?.content).toBe('My second note content');
});

it('supports inline rename and preserves manual title after content edits', () => {
  render(<App />);

  const nodeRow = screen.getByRole('treeitem', { name: 'Welcome to Foliole' });
  fireEvent.doubleClick(nodeRow);

  const renameInput = screen.getByRole('textbox', { name: /Rename/i });
  fireEvent.change(renameInput, { target: { value: 'Manual Article Title' } });
  fireEvent.keyDown(renameInput, { key: 'Enter' });

  expect(useWorkspaceStore.getState().nodesById['node-1']?.title).toBe('Manual Article Title');

  fireEvent.change(screen.getByTestId('editor-value'), { target: { value: '# New Heading\nBody content' } });
  expect(useWorkspaceStore.getState().nodesById['node-1']?.title).toBe('Manual Article Title');
});
