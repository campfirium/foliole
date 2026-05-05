import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import './reactPdfMock';

vi.mock('../shared/platform/bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/platform/bridge')>();
  return {
    ...actual,
    getRuntimeInvoke: vi.fn()
  };
});

import { EDITOR_DISPLAY_MODE_KEY } from '../features/editor/model/editorDisplayMode';
import { getRuntimeInvoke } from '../shared/platform/bridge';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, FIXED_TIMESTAMP } from './app-smoke.shared';

const { App } = await import('../app/App');

function createReadingProfile(nextAt: string) {
  return {
    intervalDurationMs: 24 * 60 * 60 * 1000,
    intervalGrowthFactor: 1.3,
    lastHandledAt: '2026-02-24T00:00:00.000Z',
    nextAt,
    priority: 5 as const,
    readingPosition: 0,
    repetitionCount: 1,
    state: 'active' as const
  };
}

function createDueReview() {
  return {
    due: FIXED_TIMESTAMP,
    lastReviewAt: null,
    state: 0 as const,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0
  };
}

function expectReviewToolbarSummary(summary: string) {
  expect(screen.getAllByText(summary).length).toBeGreaterThan(0);
}

function getPressedTreeItem(name: string) {
  return screen.getAllByRole('treeitem', { name }).find((item) => item.getAttribute('aria-pressed') === 'true') ?? null;
}

beforeEach(() => {
  vi.mocked(getRuntimeInvoke).mockReset();
});

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
  const invoke = vi.fn().mockImplementation((command: string, args?: { nodeId?: string }) => {
    if (command === 'load_node_document' && args?.nodeId === 'node-2') {
      return Promise.resolve({
        nodeId: 'node-2',
        content: 'Prompt [...]',
        hideTitleHeading: false,
        reveal: 'Answer'
      });
    }
    return Promise.resolve(null);
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-1': createNode({
        id: 'node-1',
        kind: 'topic',
        title: 'Reading 1',
        content: 'Read this first',
        reveal: null,
        review: null,
        reading: createReadingProfile(FIXED_TIMESTAMP)
      }),
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'QA 2',
        content: 'Prompt [...]',
        reveal: 'Answer',
        review: createDueReview()
      })
    }
  }));

  render(<App />);

  expect(screen.getByRole('button', { name: 'Study' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Study' }));
  await waitFor(() => expect(useWorkspaceStore.getState().reviewSession.queueNodeIds).toEqual(['node-2', 'node-1']));
  expectReviewToolbarSummary('2 left · 0 done');
  expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Again' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
  expect(screen.queryByRole('button', { name: 'Show Answer' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Again' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText('Cloze answer section')).toBeInTheDocument());
});

it('enters review mode with the reading queue when no FSRS cards are due', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodesById: {
      ...state.nodesById,
      'node-1': createNode({
        id: 'node-1',
        kind: 'topic',
        title: 'Reading 1',
        content: 'Read this first',
        reveal: null,
        review: null,
        reading: createReadingProfile(FIXED_TIMESTAMP)
      })
    }
  }));

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Study' }));

  await waitFor(() => expect(useWorkspaceStore.getState().reviewSession.queueNodeIds).toEqual(['node-1']));
  expectReviewToolbarSummary('1 left · 0 done');
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
      'node-1': createNode({
        id: 'node-1',
        kind: 'item',
        title: 'Welcome to Foliole',
        content: '# Welcome to Foliole\n\nStart writing markdown here.',
        reveal: 'Answer 1',
        review: createDueReview()
      }),
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'QA 2',
        content: 'Prompt 2',
        reveal: 'Answer 2',
        review: createDueReview()
      })
    }
  }));

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Study' }));
  expectReviewToolbarSummary('2 left · 0 done');
  fireEvent.click(await screen.findByRole('button', { name: 'Show Answer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Good' }));
  await waitFor(() => {
    expectReviewToolbarSummary('1 left · 1 done');
  });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
  });
  await waitFor(() => {
    expect(getPressedTreeItem('QA 2')).not.toBeNull();
  });
});

it('keeps review toolbar visible in completed state until user exits', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodesById: {
      ...state.nodesById,
      'node-1': createNode({
        id: 'node-1',
        kind: 'item',
        title: 'Welcome to Foliole',
        content: '# Welcome to Foliole\n\nStart writing markdown here.',
        reveal: 'Answer 1',
        review: createDueReview()
      })
    }
  }));

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Study' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Show Answer' }));
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
