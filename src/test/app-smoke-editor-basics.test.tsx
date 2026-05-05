import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../store/workspaceStore';

function createTopicFromHeaderMenu() {
  fireEvent.keyDown(screen.getByRole('button', { name: 'New' }), { key: 'ArrowDown' });
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

function clearActiveNodeSelection() {
  useWorkspaceStore.setState({
    activeNodeId: null
  });
}

it('shows the empty workspace state when no note exists yet', () => {
  keepOnlyInboxWithoutActiveNode();

  render(<App />);
  expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  expect(screen.getByText('Create your first document or folder from the list toolbar to start building the workspace.')).toBeInTheDocument();
  expect(screen.getByText('No document selected')).toBeInTheDocument();
  expect(screen.queryByTestId('editor-value')).not.toBeInTheDocument();
});

it('shows the document empty state when no note is selected', () => {
  clearActiveNodeSelection();

  render(<App />);
  expect(screen.getByText('No document selected')).toBeInTheDocument();
  expect(screen.queryByTestId('editor-value')).not.toBeInTheDocument();
});

it('creates a new empty note from node panel action', () => {
  const initialNodeOrder = [...useWorkspaceStore.getState().nodeOrder];

  render(<App />);
  createTopicFromHeaderMenu();

  const workspace = useWorkspaceStore.getState();
  expect(workspace.activeNodeId).toBeTruthy();
  if (!workspace.activeNodeId) {
    throw new Error('expected active node to be created');
  }
  expect(workspace.nodeOrder).toHaveLength(initialNodeOrder.length + 1);
  expect(workspace.nodesById[workspace.activeNodeId]?.content).toBe('');
  expect(workspace.nodesById[workspace.activeNodeId]?.parentNodeId).toBeNull();
  expect(workspace.nodesById[workspace.activeNodeId]?.title).toBe('Untitled');
});

it('increments Untitled titles when creating multiple empty notes', () => {
  render(<App />);
  createTopicFromHeaderMenu();
  createTopicFromHeaderMenu();

  const titles = useWorkspaceStore
    .getState()
    .nodeOrder
    .filter((nodeId) => nodeId !== INBOX_NODE_ID)
    .map((nodeId) => useWorkspaceStore.getState().nodesById[nodeId]?.title);
  const untitledTitles = titles.filter((title): title is string => title?.startsWith('Untitled') ?? false);

  expect(untitledTitles).toHaveLength(2);
  expect(untitledTitles).toEqual(expect.arrayContaining(['Untitled', 'Untitled 1']));
});

it('keeps first note content unchanged when editing a newly created note', async () => {
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

  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe(newNodeId);
    expect(screen.getByTestId('editor-value')).toHaveValue('');
  });

  fireEvent.change(screen.getByTestId('editor-value'), {
    target: { value: 'My second note content' }
  });

  await waitFor(() => {
    const workspaceAfterEdit = useWorkspaceStore.getState();
    expect(workspaceAfterEdit.nodesById[firstNodeId]?.content).toBe('');
    expect(workspaceAfterEdit.nodesById[newNodeId]?.content).toBe('My second note content');
  });
});

it('preserves a manual title after content edits', () => {
  render(<App />);

  useWorkspaceStore.getState().updateNodeTitle('node-1', 'Manual Article Title');

  expect(useWorkspaceStore.getState().nodesById['node-1']?.title).toBe('Manual Article Title');

  fireEvent.change(screen.getByTestId('editor-value'), { target: { value: '# New Heading\nBody content' } });
  expect(useWorkspaceStore.getState().nodesById['node-1']?.title).toBe('Manual Article Title');
});
