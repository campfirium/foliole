import { beforeEach, expect, it } from 'vitest';

import type { Node, NodeReadingProfile } from '../features/nodes/model/nodeTypes';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

const now = '2026-05-25T08:00:00.000Z';

function reading(state: NodeReadingProfile['state']): NodeReadingProfile {
  return {
    intervalDurationMs: 0,
    intervalGrowthFactor: 1,
    lastHandledAt: now,
    nextAt: now,
    priority: 5,
    readingPosition: 0,
    repetitionCount: 0,
    state
  };
}

function topic(id: string, state: NodeReadingProfile['state']): Node {
  return {
    id,
    parentNodeId: 'folder',
    kind: 'topic',
    title: id,
    content: `# ${id}`,
    hasContent: true,
    reveal: null,
    review: null,
    reading: reading(state),
    createdAt: now,
    updatedAt: now
  };
}

function folder(manualChildOrder: string[]): Node {
  return {
    id: 'folder',
    parentNodeId: null,
    kind: 'folder',
    sequentialReadingEnabled: true,
    manualChildOrder,
    title: 'Folder',
    content: '',
    hasContent: false,
    reveal: null,
    review: null,
    reading: null,
    createdAt: now,
    updatedAt: now
  };
}

beforeEach(() => {
  useWorkspaceStore.setState({
    ...createInitialWorkspaceState(new Date(now)),
    activeNodeId: 'topic-a',
    nodeOrder: ['folder', 'topic-a', 'topic-b', 'topic-c'],
    nodesById: {
      folder: folder(['topic-a', 'topic-b', 'topic-c']),
      'topic-a': topic('topic-a', 'active'),
      'topic-b': topic('topic-b', 'locked'),
      'topic-c': topic('topic-c', 'dismissed')
    },
    reviewSession: {
      currentNodeId: 'topic-a',
      currentItemStartedAt: now,
      isAnswerRevealed: true,
      queueNodeIds: ['topic-a'],
      sessionStartedAt: now,
      totalNodeCount: 1
    },
    reviewSessionMode: 'reading-only'
  });
});

it('releases the first non-dismissed topic and refreshes the current queue after sequential folder manual ordering changes', () => {
  useWorkspaceStore.getState().setFolderManualChildOrder?.('folder', ['topic-c', 'topic-b', 'topic-a'], now);
  const state = useWorkspaceStore.getState();

  expect(state.nodesById['topic-c']?.reading?.state).toBe('dismissed');
  expect(state.nodesById['topic-b']?.reading?.state).toBe('active');
  expect(state.nodesById['topic-a']?.reading?.state).toBe('locked');
  expect(state.activeNodeId).toBe('topic-b');
  expect(state.reviewSession.currentNodeId).toBe('topic-b');
  expect(state.reviewSession.queueNodeIds).toEqual(['topic-b']);
  expect(state.reviewSession.isAnswerRevealed).toBe(false);
});

it('updates only the folder order when sequential reading is disabled', () => {
  useWorkspaceStore.setState((state) => ({
    nodesById: {
      ...state.nodesById,
      folder: {
        ...state.nodesById.folder!,
        sequentialReadingEnabled: false
      }
    },
    reviewSession: {
      currentNodeId: null,
      isAnswerRevealed: false,
      queueNodeIds: [],
      totalNodeCount: 0
    }
  }));

  useWorkspaceStore.getState().setFolderManualChildOrder?.('folder', ['topic-b', 'topic-a'], '2026-05-25T09:00:00.000Z');
  const state = useWorkspaceStore.getState();

  expect(state.nodesById.folder?.manualChildOrder).toEqual(['topic-b', 'topic-a']);
  expect(state.nodesById.folder?.updatedAt).toBe('2026-05-25T09:00:00.000Z');
  expect(state.nodesById['topic-a']?.reading?.state).toBe('active');
  expect(state.nodesById['topic-b']?.reading?.state).toBe('locked');
});
