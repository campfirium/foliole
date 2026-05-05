import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, FIXED_TIMESTAMP } from './app-smoke.shared';

it('renders the dev panel with resolved scheduling and raw node fields', () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    activeNodeId: 'node-dev',
    nodeOrder: ['node-dev'],
    nodesById: {
      'node-dev': createNode({
        id: 'node-dev',
        title: 'Ignored title',
        content: '# Prompt',
        reveal: 'Answer',
        priority: 2,
        desiredRetention: 0.88,
        review: {
          due: '2026-02-26T00:00:00.000Z',
          lastReviewAt: FIXED_TIMESTAMP,
          state: 2,
          stability: 7.5,
          difficulty: 4.2,
          elapsedDays: 1,
          scheduledDays: 2,
          reps: 5,
          lapses: 1
        }
      })
    }
  }));

  render(<App />);

  expect(screen.getByRole('button', { name: 'Dev panel' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Scheduling')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument();
  expect(screen.getByText('Node')).toBeInTheDocument();
  expect(screen.getByText('88.0% · Explicit')).toBeInTheDocument();
  expect(screen.getByText('P2 · Explicit')).toBeInTheDocument();
  expect(screen.queryByText('Node info')).not.toBeInTheDocument();
  expect(screen.queryByText(/^Title$/)).not.toBeInTheDocument();
});
