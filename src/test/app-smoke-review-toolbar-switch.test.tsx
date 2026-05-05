import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../shared/platform/bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/platform/bridge')>();
  return {
    ...actual,
    getRuntimeInvoke: vi.fn()
  };
});

import './app-smoke.shared';

import { App } from '../app/App';
import { getRuntimeInvoke } from '../shared/platform/bridge';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, FIXED_TIMESTAMP } from './app-smoke.shared';

beforeEach(() => {
  vi.mocked(getRuntimeInvoke).mockReset();
});

function mockDocumentLoad() {
  const invoke = vi.fn().mockImplementation((command: string, args?: { nodeId?: string }) => {
    if (command !== 'load_node_document') {
      return Promise.resolve(null);
    }
    if (args?.nodeId === 'fsrs-1') {
      return Promise.resolve({
        nodeId: 'fsrs-1',
        content: 'Prompt 1',
        hideTitleHeading: false,
        reveal: 'Answer 1'
      });
    }
    if (args?.nodeId === 'reading-1') {
      return Promise.resolve({
        nodeId: 'reading-1',
        content: 'Read this first',
        hideTitleHeading: false,
        reveal: null
      });
    }
    return Promise.resolve(null);
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  return invoke;
}

function createReadingNode(id: string, title: string, content: string) {
  return createNode({
    id,
    kind: 'topic',
    title,
    content,
    reveal: null,
    reading: {
      intervalDurationMs: 24 * 60 * 60 * 1000,
      intervalGrowthFactor: 1.3,
      lastHandledAt: '2026-03-02T00:00:00.000Z',
      nextAt: FIXED_TIMESTAMP,
      priority: 5,
      readingPosition: 0,
      repetitionCount: 1,
      state: 'active'
    }
  });
}

it('switches toolbar actions when review queue advances from fsrs card to reading card', async () => {
  mockDocumentLoad();
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'reading-1',
    nodeOrder: ['reading-1', 'fsrs-1'],
    nodesById: {
      ...state.nodesById,
      'reading-1': createReadingNode('reading-1', 'Reading 1', 'Read this first'),
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
    }
  }));

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Study' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Review mode toolbar')).toHaveAttribute('data-review-item-kind', 'fsrs');
  });
  expect(useWorkspaceStore.getState().reviewSession.queueNodeIds).toEqual(['fsrs-1', 'reading-1']);
  expect(screen.getByTestId('editor-value')).toHaveValue('Prompt 1');
  expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Good' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Review mode toolbar')).toHaveAttribute('data-review-item-kind', 'reading');
  });
  expect(screen.getByTestId('editor-value')).toHaveValue('Read this first');
  expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Show Answer' })).not.toBeInTheDocument();
});

it('switches the review session when clicking another queued node during study', async () => {
  mockDocumentLoad();
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'reading-1',
    nodeOrder: ['reading-1', 'fsrs-1'],
    nodesById: {
      ...state.nodesById,
      'reading-1': createReadingNode('reading-1', 'Reading 1', 'Read this first'),
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

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Study' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Review mode toolbar')).toHaveAttribute('data-review-item-kind', 'fsrs');
  });
  expect(screen.getByTestId('editor-value')).toHaveValue('Prompt 1');

  fireEvent.click(screen.getByRole('treeitem', { name: 'Reading 1' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Review mode toolbar')).toHaveAttribute('data-review-item-kind', 'reading');
  });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('reading-1');
  expect(useWorkspaceStore.getState().reviewSession.currentNodeId).toBe('reading-1');
  expect(useWorkspaceStore.getState().reviewSession.queueNodeIds).toEqual(['reading-1', 'fsrs-1']);
  expect(screen.getByTestId('editor-value')).toHaveValue('Read this first');
  expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
});
