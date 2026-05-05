import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

it('renders the review queue panel with the active session queue', () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    activeNodeId: 'fsrs-1',
    nodeOrder: ['fsrs-1', 'reading-1'],
    nodesById: {
      'fsrs-1': createNode({
        id: 'fsrs-1',
        title: 'Review prompt',
        content: '# Prompt',
        reveal: 'Answer',
        review: {
          due: '2026-02-24T00:00:00.000Z',
          lastReviewAt: '2026-02-20T00:00:00.000Z',
          state: 2,
          stability: 4,
          difficulty: 4,
          elapsedDays: 1,
          scheduledDays: 2,
          reps: 2,
          lapses: 0
        }
      }),
      'reading-1': createNode({
        id: 'reading-1',
        title: 'Reading passage',
        content: 'Read me',
        reading: {
          intervalDurationMs: 86400000,
          intervalGrowthFactor: 1.5,
          lastHandledAt: '2026-02-20T00:00:00.000Z',
          nextAt: '2026-02-24T00:00:00.000Z',
          priority: 3,
          readingPosition: 0,
          repetitionCount: 1,
          state: 'active'
        }
      })
    },
    reviewSession: {
      currentNodeId: 'fsrs-1',
      isAnswerRevealed: false,
      queueNodeIds: ['fsrs-1', 'reading-1'],
      totalNodeCount: 2
    }
  }));

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Review queue panel' }));
  const queueList = screen.getByRole('list', { name: 'Review queue items' });

  expect(screen.getByRole('button', { name: 'Review queue panel' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Current queue')).toBeInTheDocument();
  expect(within(queueList).getByText(/Review prompt$/)).toBeInTheDocument();
  expect(within(queueList).getByText(/Reading passage$/)).toBeInTheDocument();
  expect(within(queueList).getByText('Current')).toBeInTheDocument();
});
