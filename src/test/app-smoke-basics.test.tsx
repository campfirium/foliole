import { fireEvent, render, screen } from '@testing-library/react';
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
  expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Again' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
  expect(screen.queryByRole('button', { name: 'Show Answer' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Again' })).toBeInTheDocument();
  expect(screen.getByLabelText('Cloze answer section')).toBeInTheDocument();
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
  fireEvent.click(screen.getByRole('button', { name: 'QA 2' }));
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
