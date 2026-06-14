import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, FIXED_TIMESTAMP } from './app-smoke.shared';

const RELEASE_GATE_TEST_TIMEOUT_MS = 15_000;
const RELEASE_GATE_WAIT_OPTIONS = { timeout: RELEASE_GATE_TEST_TIMEOUT_MS };

it('renders topic scheduling from reading cadence instead of FSRS fields', async () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    activeNodeId: 'topic-dev',
    nodeOrder: ['topic-dev'],
    nodesById: {
      'topic-dev': createNode({
        id: 'topic-dev',
        title: 'Ignored title',
        content: '# Prompt',
        kind: 'topic',
        priority: 2,
        reading: {
          intervalDurationMs: 2 * 24 * 60 * 60 * 1000,
          intervalGrowthFactor: 1.4,
          lastHandledAt: FIXED_TIMESTAMP,
          nextAt: '2026-02-27T00:00:00.000Z',
          priority: 2,
          readingPosition: 0,
          repetitionCount: 3,
          state: 'active'
        }
      })
    }
  }));

  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.rightSidebarActivePanel, 'dev');
  render(<App />);

  expect(await screen.findByRole('button', { name: 'More right sidebar panels' })).toHaveAttribute('aria-pressed', 'true');
  expect(await screen.findByText('Scheduling', undefined, RELEASE_GATE_WAIT_OPTIONS)).toBeInTheDocument();
  expect(screen.getByText('Topic')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Schedule' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Decision parameters' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument();
  expect(screen.getAllByText('P2')).toHaveLength(2);
  expect(screen.getByText('Initial interval')).toBeInTheDocument();
  expect(screen.getByText('Current interval')).toBeInTheDocument();
  expect(screen.getByText('Reading growth factor')).toBeInTheDocument();
  expect(screen.getByText('3')).toBeInTheDocument();
  expect(screen.queryByText('Memory')).not.toBeInTheDocument();
  expect(screen.queryByText('Retention')).not.toBeInTheDocument();
  expect(screen.queryByText(/Default/)).not.toBeInTheDocument();
  expect(screen.queryByText('Flow')).not.toBeInTheDocument();
}, RELEASE_GATE_TEST_TIMEOUT_MS);

it('renders item scheduling from FSRS review data', async () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    activeNodeId: 'item-dev',
    nodeOrder: ['item-dev'],
    nodesById: {
      'item-dev': createNode({
        id: 'item-dev',
        title: 'Review prompt',
        content: '# Prompt',
        kind: 'item',
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

  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.rightSidebarActivePanel, 'dev');
  render(<App />);

  expect(await screen.findByRole('button', { name: 'More right sidebar panels' })).toHaveAttribute('aria-pressed', 'true');
  expect(await screen.findByText('Scheduling')).toBeInTheDocument();
  expect(screen.getByText('Item')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Schedule' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Decision parameters' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument();
  expect(screen.getByText('88.0%')).toBeInTheDocument();
  expect(screen.getAllByText('P2')).toHaveLength(2);
  expect(screen.getByText('7.50 d')).toBeInTheDocument();
  expect(screen.getByText('Review count')).toBeInTheDocument();
  expect(screen.getAllByText('5')).toHaveLength(2);
  expect(screen.getByText('Lapses')).toBeInTheDocument();
  expect(screen.queryByText('Reading cadence')).not.toBeInTheDocument();
  expect(screen.queryByText(/Default/)).not.toBeInTheDocument();
  expect(screen.queryByText('Content size')).not.toBeInTheDocument();
});
