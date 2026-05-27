import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

import './app-smoke.shared';

import { App } from '../app/App';
import {
  setDevReviewStatusBarOpen,
  setDevReviewStatusBarPersistenceEnabled
} from '../app/hooks/studyModeStatusBarPersistence';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, FIXED_TIMESTAMP } from './app-smoke.shared';

beforeEach(() => {
  vi.mocked(getRuntimeInvoke).mockReset();
});

vi.stubGlobal('ResizeObserver', class { disconnect() {} observe() {} unobserve() {} });

function enablePersistedStudyMode() {
  setDevReviewStatusBarPersistenceEnabled(true);
  setDevReviewStatusBarOpen(true);
}

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

function seedReviewNavigationMismatch() {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'fsrs-1',
    navigation: { backStack: ['reading-1'], forwardStack: [] },
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
      currentNodeId: 'fsrs-1',
      isAnswerRevealed: false,
      queueNodeIds: ['fsrs-1', 'reading-1'],
      totalNodeCount: 2
    }
  }));
}

it('keeps review paused when navigation history jumps to another queued node during study', async () => {
  mockDocumentLoad();
  seedReviewNavigationMismatch();
  enablePersistedStudyMode();
  render(<App />);

  await waitFor(() => {
    expect(screen.getByLabelText('Flow toolbar')).toHaveAttribute('data-review-item-kind', 'fsrs');
  });

  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Resume review' })).toBeInTheDocument();
  });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('reading-1');
  expect(useWorkspaceStore.getState().reviewSession.currentNodeId).toBe('fsrs-1');
  expect(useWorkspaceStore.getState().reviewSession.queueNodeIds).toEqual(['fsrs-1', 'reading-1']);
  expect(screen.queryByRole('button', { name: 'Later' })).not.toBeInTheDocument();
  expect(screen.getByTestId('editor-value')).toHaveValue('Read this first');
}, 15000);
