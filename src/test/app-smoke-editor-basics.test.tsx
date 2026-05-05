import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../store/workspaceStore';

function createTopicFromHeaderMenu() {
  fireEvent.keyDown(screen.getByRole('button', { name: 'Create' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Create Topic' }));
}

function findCreatedNoteId() {
  const workspace = useWorkspaceStore.getState();
  return workspace.nodeOrder.find((nodeId) => nodeId !== INBOX_NODE_ID && nodeId !== 'node-1');
}

function keepOnlyInboxWithoutActiveNode() {
  const inboxNode = useWorkspaceStore.getState().nodesById[INBOX_NODE_ID];
  if (!inboxNode) {
    throw new Error('expected inbox node');
  }
  useWorkspaceStore.setState({
    activeNodeId: null,
    nodeOrder: [INBOX_NODE_ID],
    nodesById: { [INBOX_NODE_ID]: inboxNode }
  });
}

it('creates a note from editor typing when no active node is selected', () => {
  keepOnlyInboxWithoutActiveNode();

  render(<App />);
  fireEvent.change(screen.getByTestId('editor-value'), {
    target: { value: 'Pasted from clipboard' }
  });

  const workspace = useWorkspaceStore.getState();
  expect(workspace.activeNodeId).toBeTruthy();
  if (!workspace.activeNodeId) {
    throw new Error('expected active node to be created');
  }
  expect(workspace.nodeOrder).toHaveLength(2);
  expect(workspace.nodesById[workspace.activeNodeId]?.content).toBe('Pasted from clipboard');
});

it('creates a new empty note from node panel action', () => {
  keepOnlyInboxWithoutActiveNode();

  render(<App />);
  createTopicFromHeaderMenu();

  const workspace = useWorkspaceStore.getState();
  expect(workspace.activeNodeId).toBeTruthy();
  if (!workspace.activeNodeId) {
    throw new Error('expected active node to be created');
  }
  expect(workspace.nodeOrder).toHaveLength(2);
  expect(workspace.nodesById[workspace.activeNodeId]?.content).toBe('');
  expect(workspace.nodesById[workspace.activeNodeId]?.title).toBe('Untitled');
});

it('increments Untitled titles when creating multiple empty notes', () => {
  keepOnlyInboxWithoutActiveNode();

  render(<App />);
  createTopicFromHeaderMenu();
  createTopicFromHeaderMenu();

  const titles = useWorkspaceStore
    .getState()
    .nodeOrder
    .filter((nodeId) => nodeId !== INBOX_NODE_ID)
    .map((nodeId) => useWorkspaceStore.getState().nodesById[nodeId]?.title);

  expect(titles).toHaveLength(2);
  expect(titles).toEqual(expect.arrayContaining(['Untitled', 'Untitled 1']));
});

it('keeps first note content unchanged when editing a newly created note', () => {
  keepOnlyInboxWithoutActiveNode();
  render(<App />);
  createTopicFromHeaderMenu();
  const firstNodeId = findCreatedNoteId();
  if (!firstNodeId) {
    throw new Error('expected first created node');
  }
  createTopicFromHeaderMenu();

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
  expect(workspaceAfterEdit.nodesById[firstNodeId]?.content).toBe('');
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
