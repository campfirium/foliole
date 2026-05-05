import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { EDITOR_DISPLAY_MODE_KEY } from '../features/editor/model/editorDisplayMode';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, FIXED_TIMESTAMP } from './app-smoke.shared';

it('renders note list and single document panel', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Nodes' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Content' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Workspace top toolbar' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Workspace side toolbar' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Node breadcrumbs' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Review' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create QA Node' })).not.toBeInTheDocument();
});

it('shows editor display mode entrypoint inside more menu trigger', () => {
  render(<App />);

  expect(screen.getByRole('button', { name: 'More editor options' })).toHaveAttribute(
    'aria-haspopup',
    'menu'
  );
  expect(screen.queryByRole('button', { name: 'Switch to Source mode' })).not.toBeInTheDocument();
  expect(localStorage.getItem(EDITOR_DISPLAY_MODE_KEY)).toBeNull();
});

it('runs study flow as Study -> Show Answer -> Grade buttons enabled', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'QA 2',
        content: 'Prompt [...]',
        reveal: 'Answer',
        review: {
          due: FIXED_TIMESTAMP,
          lastReviewAt: null,
          state: 0,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0
        }
      })
    }
  }));

  render(<App />);

  expect(screen.getByRole('button', { name: 'Study' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Study' }));
  expect(screen.getByText(/Reviewing · 1 left · 0 done · Awaiting answer/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Again' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
  expect(screen.getByText(/Reviewing · 1 left · 0 done · Answer revealed/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Show Answer' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Again' })).toBeInTheDocument();
  expect(screen.getByLabelText('Cloze answer section')).toBeInTheDocument();
});

it('enters review mode and shows complete state when no due cards exist', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Study' }));

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Review complete' })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Review complete' }));
  await waitFor(() => {
    expect(screen.queryByLabelText('Review mode toolbar')).not.toBeInTheDocument();
  });
});

it('syncs node list selection when review grading advances active node', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-1': {
        ...state.nodesById['node-1'],
        reveal: 'Answer 1',
        review: {
          due: FIXED_TIMESTAMP,
          lastReviewAt: null,
          state: 0,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0
        }
      },
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'QA 2',
        content: 'Prompt 2',
        reveal: 'Answer 2',
        review: {
          due: FIXED_TIMESTAMP,
          lastReviewAt: null,
          state: 0,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0
        }
      })
    }
  }));

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Study' }));
  expect(screen.getByText(/Reviewing · 2 left · 0 done · Awaiting answer/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Good' }));
  await waitFor(() => {
    expect(screen.getByText(/Reviewing · 1 left · 1 done · Awaiting answer/i)).toBeInTheDocument();
  });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
  });
  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
  await waitFor(() => {
    expect(within(listPanel).getByRole('treeitem', { name: 'QA 2' })).toHaveAttribute('aria-pressed', 'true');
  });
});

it('keeps review toolbar visible in completed state until user exits', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodesById: {
      ...state.nodesById,
      'node-1': {
        ...state.nodesById['node-1'],
        reveal: 'Answer 1',
        review: {
          due: FIXED_TIMESTAMP,
          lastReviewAt: null,
          state: 0,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0
        }
      }
    }
  }));

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Study' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Good' }));

  await waitFor(() => {
    expect(screen.getByText('Review complete')).toBeInTheDocument();
  });
  expect(screen.getByRole('button', { name: 'Review complete' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Review complete' }));
  await waitFor(() => {
    expect(screen.queryByLabelText('Review mode toolbar')).not.toBeInTheDocument();
  });
});

it('loads selected node content into editor', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'QA 2',
        content: 'Prompt [...]',
        reveal: 'Answer'
      })
    }
  }));

  render(<App />);

  expect(screen.getByTestId('editor-value')).toHaveValue('# Welcome to Foliole\n\nStart writing markdown here.');
  fireEvent.click(screen.getByRole('treeitem', { name: 'QA 2' }));
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
  expect(screen.getByTestId('editor-value')).toHaveValue('Prompt [...]');
  expect(screen.getByTestId('answer-editor-value')).toHaveValue('Answer');
});

it('updates active node content from editor changes', () => {
  render(<App />);
  fireEvent.change(screen.getByTestId('editor-value'), {
    target: { value: 'Alpha Beta Gamma' }
  });
  expect(useWorkspaceStore.getState().nodesById['node-1']?.content).toBe('Alpha Beta Gamma');
});

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

  fireEvent.change(screen.getByTestId('editor-value'), {
    target: { value: '# New Heading\nBody content' }
  });
  expect(useWorkspaceStore.getState().nodesById['node-1']?.title).toBe('Manual Article Title');
});
