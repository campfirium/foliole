import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

import './app-smoke.shared';

import { App } from '../app/App';
import {
  setDevReviewStatusBarOpen,
  setDevReviewStatusBarPersistenceEnabled
} from '../app/hooks/studyModeStatusBarPersistence';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, createSmokeRuntimeInvoke, FIXED_TIMESTAMP, getCurrentFolderTreeItem } from './app-smoke.shared';

const FUTURE_TIMESTAMP = '2099-01-01T00:00:00.000Z';

beforeEach(() => {
  vi.mocked(getRuntimeInvoke).mockReset();
  vi.mocked(getRuntimeInvoke).mockReturnValue(createSmokeRuntimeInvoke());
});

vi.stubGlobal('ResizeObserver', class { disconnect() {} observe() {} unobserve() {} });

function enablePersistedStudyMode() {
  setDevReviewStatusBarPersistenceEnabled(true);
  setDevReviewStatusBarOpen(true);
}

function mockDocumentLoad() {
  const baseInvoke = createSmokeRuntimeInvoke();
  const invoke = vi.fn().mockImplementation((command: string, args?: { nodeId?: string }) => {
    if (command !== 'load_node_document') {
      return baseInvoke(command, args);
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
    return baseInvoke(command, args);
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  return invoke;
}

function createReadingNode(id: string, title: string, content: string, nextAt = FUTURE_TIMESTAMP) {
  return createNode({
    id,
    kind: 'topic',
    parentNodeId: INBOX_NODE_ID,
    title,
    content,
    reveal: null,
    reading: {
      intervalDurationMs: 24 * 60 * 60 * 1000,
      intervalGrowthFactor: 1.3,
      lastHandledAt: '2026-03-02T00:00:00.000Z',
      nextAt,
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
    activeNodeId: 'fsrs-1',
    nodeOrder: [INBOX_NODE_ID, 'reading-1', 'fsrs-1'],
    nodesById: {
      ...state.nodesById,
      'reading-1': createReadingNode('reading-1', 'Reading 1', 'Read this first', FIXED_TIMESTAMP),
      'fsrs-1': createNode({
        id: 'fsrs-1',
        parentNodeId: INBOX_NODE_ID,
        title: 'QA 1',
        content: 'Prompt 1',
        reveal: 'Answer 1',
        review: {
          due: FUTURE_TIMESTAMP,
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
      currentNodeId: 'fsrs-1',
      isAnswerRevealed: false,
      queueNodeIds: ['fsrs-1', 'reading-1'],
      totalNodeCount: 2
    }
  }));

  enablePersistedStudyMode();
  render(<App />);

  await waitFor(() => {
    expect(screen.getByLabelText('Flow toolbar')).toHaveAttribute('data-review-item-kind', 'fsrs');
  });
  expect(useWorkspaceStore.getState().reviewSession.queueNodeIds).toEqual(['fsrs-1', 'reading-1']);
  expect(screen.getByTestId('editor-value')).toHaveValue('Prompt 1');
  expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Good' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Flow toolbar')).toHaveAttribute('data-review-item-kind', 'reading');
  });
  expect(screen.getByTestId('editor-value')).toHaveValue('Read this first');
  expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Show Answer' })).not.toBeInTheDocument();
});

it('keeps review paused when clicking another queued node during study', async () => {
  mockDocumentLoad();
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'fsrs-1',
    nodeOrder: [INBOX_NODE_ID, 'reading-1', 'fsrs-1'],
    nodesById: {
      ...state.nodesById,
      'reading-1': createReadingNode('reading-1', 'Reading 1', 'Read this first'),
      'fsrs-1': createNode({
        id: 'fsrs-1',
        parentNodeId: INBOX_NODE_ID,
        title: 'QA 1',
        content: 'Prompt 1',
        reveal: 'Answer 1',
        review: {
          due: FUTURE_TIMESTAMP,
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
      currentNodeId: 'fsrs-1',
      isAnswerRevealed: false,
      queueNodeIds: ['fsrs-1', 'reading-1'],
      totalNodeCount: 2
    }
  }));

  enablePersistedStudyMode();
  render(<App />);

  await waitFor(() => {
    expect(screen.getByLabelText('Flow toolbar')).toHaveAttribute('data-review-item-kind', 'fsrs');
  });
  expect(screen.getByTestId('editor-value')).toHaveValue('Prompt 1');

  fireEvent.click(getCurrentFolderTreeItem('Reading 1'));

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Resume review' })).toBeInTheDocument();
  });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('reading-1');
  expect(useWorkspaceStore.getState().reviewSession.currentNodeId).toBe('fsrs-1');
  expect(useWorkspaceStore.getState().reviewSession.queueNodeIds).toEqual(['fsrs-1', 'reading-1']);
  expect(screen.getByTestId('editor-value')).toHaveValue('Read this first');
  expect(screen.queryByRole('button', { name: 'Later' })).not.toBeInTheDocument();
});
