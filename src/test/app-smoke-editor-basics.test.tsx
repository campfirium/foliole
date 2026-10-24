import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { getGuidedSampleContent } from '../../lib/core/guidedSample/guidedSampleContent';
import { App } from '../app/App';
import { ensureGuidedSampleTopicTree } from '../features/guidedSample/model/guidedSampleWorkspace';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { consumeGuidedSampleStartup } from '../shared/platform/desktop/guidedSampleStartupRuntime';
import { createEmptyWorkspaceActionHistory } from '../store/workspaceActionHistory';
import { useWorkspaceStore } from '../store/workspaceStore';

import { mockEditorState } from './app-smoke.shared';

vi.mock('../shared/platform/desktop/guidedSampleStartupRuntime', () => ({ consumeGuidedSampleStartup: vi.fn() }));

beforeEach(() => {
  vi.mocked(consumeGuidedSampleStartup).mockReset();
  vi.mocked(consumeGuidedSampleStartup).mockResolvedValue(null);
});

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
    nodesById: { [INBOX_NODE_ID]: inboxNode },
    rendererBoundaryKeepNodeIds: []
  });
  mockEditorState.content = '';
  mockEditorState.selectionFrom = 0;
  mockEditorState.selectionTo = 0;
}

function clearActiveNodeSelection() {
  useWorkspaceStore.setState({
    activeNodeId: null
  });
}

it('leaves an empty library empty when the host has no startup sample', async () => {
  keepOnlyInboxWithoutActiveNode();
  const empty = useWorkspaceStore.getState();

  await act(async () => { render(<App />); });

  expect(consumeGuidedSampleStartup).toHaveBeenCalledTimes(1);
  const workspace = useWorkspaceStore.getState();
  expect(workspace.nodeOrder).toEqual(empty.nodeOrder);
  expect(workspace.nodesById).toEqual(empty.nodesById);
  expect(workspace.activeNodeId).toBeNull();
  expect(workspace.reviewSession.currentNodeId).toBeNull();
  expect(workspace.appActionHistory.undoStack).toHaveLength(0);
  expect(screen.getByText('No document selected')).toBeInTheDocument();
  expect(screen.queryByTestId('editor-value')).not.toBeInTheDocument();
});

it('opens the host-seeded sample in Flow without creating more topics or undo entries', async () => {
  keepOnlyInboxWithoutActiveNode();
  const { rootNodeId, queueNodeIds } = await ensureGuidedSampleTopicTree(() => useWorkspaceStore.getState(), 'en');
  if (!rootNodeId) throw new Error('expected a seeded sample root');
  useWorkspaceStore.setState({ activeNodeId: null, appActionHistory: createEmptyWorkspaceActionHistory() });
  const seeded = useWorkspaceStore.getState();
  vi.mocked(consumeGuidedSampleStartup).mockResolvedValue(rootNodeId);

  render(<App />);

  await waitFor(() => {
    expect(useWorkspaceStore.getState().reviewSession.currentNodeId).toBe(rootNodeId);
    expect(screen.getByTestId('editor-value')).toHaveValue(getGuidedSampleContent('en').root.content);
    expect(screen.getByLabelText('Flow toolbar')).toBeInTheDocument();
  });
  const workspace = useWorkspaceStore.getState();
  expect(consumeGuidedSampleStartup).toHaveBeenCalledTimes(1);
  expect(workspace.activeNodeId).toBe(rootNodeId);
  expect(workspace.reviewSession.queueNodeIds).toEqual(queueNodeIds);
  expect(workspace.nodeOrder).toEqual(seeded.nodeOrder);
  expect(workspace.appActionHistory.undoStack).toHaveLength(0);
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
  await act(async () => {
    await window.__folioleFlushPendingEditorDraftBeforeClose?.();
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
