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
        kind: 'item',
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
        kind: 'topic',
        title: 'Reading passage',
        content: 'Read me',
        reveal: null,
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
  expect(screen.getByText('Whole queue')).toBeInTheDocument();
  expect(within(queueList).getByText(/Review prompt$/)).toBeInTheDocument();
  expect(within(queueList).getByText(/Reading passage$/)).toBeInTheDocument();
  expect(within(queueList).getByText('Current')).toBeInTheDocument();
});

it('labels cloze review nodes as FSRS in the review queue panel', () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    activeNodeId: 'cloze-1',
    nodeOrder: ['cloze-1', 'reading-1'],
    nodesById: {
      'cloze-1': createNode({
        id: 'cloze-1',
        kind: 'item',
        title: 'Cloze prompt',
        content: '# Prompt',
        reveal: null,
        anchorLink: {
          id: 'anchor-1',
          kind: 'cloze'
        },
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
        kind: 'topic',
        title: 'Reading passage',
        content: 'Read me',
        reveal: null
      })
    },
    reviewSession: {
      currentNodeId: 'cloze-1',
      isAnswerRevealed: false,
      queueNodeIds: ['cloze-1', 'reading-1'],
      totalNodeCount: 2
    }
  }));

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Review queue panel' }));
  const queueList = screen.getByRole('list', { name: 'Review queue items' });

  expect(within(queueList).getByText(/1\. Cloze prompt$/)).toBeInTheDocument();
  expect(within(queueList).getByText('Review item queue')).toBeInTheDocument();
});

it('shows scheduled review cards in the whole queue even when the live review session only contains reading items', () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    activeNodeId: 'reading-1',
    nodeOrder: ['cloze-scheduled', 'reading-1'],
    nodesById: {
      'cloze-scheduled': createNode({
        id: 'cloze-scheduled',
        kind: 'item',
        title: 'Scheduled review card',
        content: 'Prompt [...]',
        reveal: null,
        anchorLink: {
          id: 'anchor-2',
          kind: 'cloze'
        },
        review: {
          due: '2026-03-19T11:09:42.000Z',
          lastReviewAt: '2026-03-17T11:09:42.000Z',
          state: 2,
          stability: 0.21,
          difficulty: 9.49,
          elapsedDays: 3,
          scheduledDays: 2,
          reps: 10,
          lapses: 2
        }
      }),
      'reading-1': createNode({
        id: 'reading-1',
        kind: 'topic',
        title: 'Reading passage',
        content: 'Read me',
        reveal: null,
        reading: {
          intervalDurationMs: 86400000,
          intervalGrowthFactor: 1.5,
          lastHandledAt: '2026-03-16T11:09:42.000Z',
          nextAt: '2026-03-17T11:09:42.000Z',
          priority: 5,
          readingPosition: 0,
          repetitionCount: 10,
          state: 'active'
        }
      })
    },
    reviewSession: {
      currentNodeId: 'reading-1',
      isAnswerRevealed: false,
      queueNodeIds: ['reading-1'],
      totalNodeCount: 1
    }
  }));

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Review queue panel' }));
  const queueList = screen.getByRole('list', { name: 'Review queue items' });

  expect(within(queueList).getByText(/Scheduled review card$/)).toBeInTheDocument();
  expect(within(queueList).getByText(/(Due|Scheduled) ·/)).toBeInTheDocument();
  expect(within(queueList).getByText(/Reading passage$/)).toBeInTheDocument();
});
