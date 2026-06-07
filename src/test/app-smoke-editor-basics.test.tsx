import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../store/workspaceStore';

function createTopicFromHeaderMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Create topic' }));
}

function findCreatedNoteId() {
  const workspace = useWorkspaceStore.getState();
  return workspace.nodeOrder.find((nodeId) => {
    const node = workspace.nodesById[nodeId];
    return node?.parentNodeId === INBOX_NODE_ID && node.id !== 'node-1' && node.title.startsWith('Untitled');
  });
}

function getCreatedUntitledTitles() {
  const workspace = useWorkspaceStore.getState();
  return workspace.nodeOrder
    .map((nodeId) => workspace.nodesById[nodeId])
    .filter((node): node is NonNullable<typeof node> =>
      Boolean(node?.parentNodeId === INBOX_NODE_ID && node.title.startsWith('Untitled'))
    )
    .map((node) => node.title);
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

it('creates a new empty note from node panel action', async () => {
  const initialNodeOrder = [...useWorkspaceStore.getState().nodeOrder];

  render(<App />);
  createTopicFromHeaderMenu();

  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodeOrder).toHaveLength(initialNodeOrder.length + 1);
  });
  const workspace = useWorkspaceStore.getState();
  expect(workspace.activeNodeId).toBeTruthy();
  if (!workspace.activeNodeId) {
    throw new Error('expected active node to be created');
  }
  expect(workspace.nodesById[workspace.activeNodeId]?.content).toBe('');
  expect(workspace.nodesById[workspace.activeNodeId]?.parentNodeId).toBe(INBOX_NODE_ID);
  expect(workspace.nodesById[workspace.activeNodeId]?.title).toBe('Untitled');
});

it('increments Untitled titles when creating multiple empty notes', async () => {
  render(<App />);
  createTopicFromHeaderMenu();
  await waitFor(() => {
    expect(getCreatedUntitledTitles()).toHaveLength(1);
  });
  createTopicFromHeaderMenu();

  await waitFor(() => {
    expect(getCreatedUntitledTitles()).toHaveLength(2);
  });
  const untitledTitles = getCreatedUntitledTitles();

  expect(untitledTitles).toEqual(expect.arrayContaining(['Untitled', 'Untitled 1']));
});

it('keeps first note content unchanged when editing a newly created note', async () => {
  render(<App />);
  createTopicFromHeaderMenu();
  await waitFor(() => expect(findCreatedNoteId()).toBeTruthy());
  const firstNodeId = findCreatedNoteId();
  if (!firstNodeId) {
    throw new Error('expected first created node');
  }
  createTopicFromHeaderMenu();

  await waitFor(() => {
    expect(getCreatedUntitledTitles()).toHaveLength(2);
  });
  const newNodeId = useWorkspaceStore.getState().activeNodeId;
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

it('preserves a manual title after content edits', async () => {
  render(<App />);

  await useWorkspaceStore.getState().updateNodeTitle('node-1', 'Manual Article Title');

  expect(useWorkspaceStore.getState().nodesById['node-1']?.title).toBe('Manual Article Title');

  fireEvent.change(screen.getByTestId('editor-value'), { target: { value: '# New Heading\nBody content' } });
  expect(useWorkspaceStore.getState().nodesById['node-1']?.title).toBe('Manual Article Title');
});
