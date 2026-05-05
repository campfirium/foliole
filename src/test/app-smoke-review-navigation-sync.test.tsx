import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, FIXED_TIMESTAMP } from './app-smoke.shared';

function seedReviewNavigationMismatch() {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'reading-1',
    navigation: { backStack: ['fsrs-1'], forwardStack: [] },
    nodeOrder: ['reading-1', 'fsrs-1'],
    nodesById: {
      ...state.nodesById,
      'reading-1': createNode({
        id: 'reading-1',
        title: 'Reading 1',
        content: 'Read this first'
      }),
      'fsrs-1': createNode({
        id: 'fsrs-1',
        title: 'QA 1',
        content: 'Prompt 1',
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
      })
    },
    reviewSession: {
      currentNodeId: 'reading-1',
      isAnswerRevealed: false,
      queueNodeIds: ['reading-1', 'fsrs-1'],
      totalNodeCount: 2
    }
  }));
}

it('keeps review toolbar in sync when navigation history jumps to another queued node during study', async () => {
  seedReviewNavigationMismatch();
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Study' }));

  useWorkspaceStore.setState((state) => ({
    ...state,
    activeNodeId: 'reading-1',
    navigation: { backStack: ['fsrs-1'], forwardStack: [] },
    reviewSession: {
      currentNodeId: 'reading-1',
      isAnswerRevealed: false,
      queueNodeIds: ['reading-1', 'fsrs-1'],
      totalNodeCount: 2
    }
  }));

  await waitFor(() => {
    expect(screen.getByLabelText('Review mode toolbar')).toHaveAttribute('data-review-item-kind', 'reading');
  });

  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Review mode toolbar')).toHaveAttribute('data-review-item-kind', 'fsrs');
  });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('fsrs-1');
  expect(useWorkspaceStore.getState().reviewSession.currentNodeId).toBe('fsrs-1');
  expect(useWorkspaceStore.getState().reviewSession.queueNodeIds).toEqual(['fsrs-1', 'reading-1']);
  expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument();
  expect(screen.getByTestId('editor-value')).toHaveValue('Prompt 1');
});
