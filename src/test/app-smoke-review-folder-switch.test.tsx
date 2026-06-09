import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

import { createNode, createSmokeRuntimeInvoke } from './app-smoke.shared';

const DUE = '2026-03-03T00:00:00.000Z';

beforeEach(() => {
  vi.mocked(getRuntimeInvoke).mockReset();
  vi.mocked(getRuntimeInvoke).mockReturnValue(createSmokeRuntimeInvoke());
});

vi.stubGlobal('ResizeObserver', class { disconnect() {} observe() {} unobserve() {} });

function enablePersistedStudyMode() {
  setDevReviewStatusBarPersistenceEnabled(true);
  setDevReviewStatusBarOpen(true);
}

it('keeps folder navigation available while the review status bar is open', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'qa-1',
    nodeOrder: ['folder-a', 'qa-1', 'folder-b', 'topic-b'],
    nodesById: {
      ...state.nodesById,
      'folder-a': createNode({ id: 'folder-a', kind: 'folder', parentNodeId: null, title: 'Folder A', content: '' }),
      'qa-1': createNode({
        id: 'qa-1',
        parentNodeId: 'folder-a',
        title: 'QA 1',
        content: 'Prompt 1',
        reveal: 'Answer 1',
        review: {
          due: DUE,
          lastReviewAt: null,
          state: 0,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0
        }
      }),
      'folder-b': createNode({ id: 'folder-b', kind: 'folder', parentNodeId: null, title: 'Folder B', content: '' }),
      'topic-b': createNode({
        id: 'topic-b',
        kind: 'topic',
        parentNodeId: 'folder-b',
        title: 'Topic B',
        content: 'Folder B topic'
      })
    },
    reviewSession: {
      currentNodeId: 'qa-1',
      isAnswerRevealed: false,
      queueNodeIds: ['qa-1'],
      totalNodeCount: 1
    }
  }));

  enablePersistedStudyMode();
  render(<App />);

  await waitFor(() => expect(screen.getByLabelText('Flow toolbar')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('treeitem', { name: 'Folder B' }));

  await waitFor(() => expect(useWorkspaceStore.getState().activeNodeId).toBe('folder-b'));
  expect(useWorkspaceStore.getState().reviewSession.currentNodeId).toBe('qa-1');
  expect(screen.getByRole('button', { name: 'Resume review' })).toBeInTheDocument();
  expect(within(screen.getByRole('complementary', { name: 'Current folder contents' })).getByRole('treeitem', {
    name: 'Topic B'
  })).toBeInTheDocument();
});
