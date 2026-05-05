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
  expect(screen.getByRole('region', { name: 'Workspace side toolbar' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Node breadcrumbs' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Review mode toolbar')).not.toBeInTheDocument();
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

it('runs study flow with FSRS cards consumed before queued reading cards', async () => {
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
  await waitFor(() => expect(useWorkspaceStore.getState().reviewSession.queueNodeIds).toEqual(['node-2', 'node-1']));
  expect(screen.getByText(/Reviewing · 2 left · 0 done · Awaiting answer/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Again' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
  expect(screen.getByText(/Reviewing · 2 left · 0 done · Answer revealed/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Show Answer' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Again' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('3d')).toBeInTheDocument());
  expect(screen.getByLabelText('Cloze answer section')).toBeInTheDocument();
});

it('enters review mode with the reading queue when no FSRS cards are due', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Study' }));

  await waitFor(() => expect(useWorkspaceStore.getState().reviewSession.queueNodeIds).toEqual(['node-1']));
  expect(screen.getByText(/Reviewing · 1 left · 0 done · Awaiting answer/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Good' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Read' }));
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
