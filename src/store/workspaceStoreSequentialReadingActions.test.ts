import { beforeEach, expect, it } from 'vitest';

import type { Node, NodeReadingProfile } from '../features/nodes/model/nodeTypes';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

const now = '2026-05-27T08:00:00.000Z';

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

function node(args: Partial<Node> & Pick<Node, 'id' | 'parentNodeId'>): Node {
  return {
    content: '# Topic',
    createdAt: now,
    hasContent: true,
    hideTitleHeading: false,
    kind: 'topic',
    reading: reading('active'),
    reveal: null,
    review: null,
    title: args.id,
    updatedAt: now,
    ...args,
    id: args.id,
    parentNodeId: args.parentNodeId
  };
}

beforeEach(() => {
  useWorkspaceStore.setState({
    ...createInitialWorkspaceState(new Date(now)),
    activeNodeId: 'drucker',
    nodeOrder: ['books', 'debugging', 'drucker'],
    nodesById: {
      books: node({ content: '', id: 'books', kind: 'folder', parentNodeId: null, reading: null, sequentialReadingEnabled: false }),
      debugging: node({ id: 'debugging', parentNodeId: 'books' }),
      drucker: node({ id: 'drucker', parentNodeId: 'books' })
    },
    reviewSession: {
      currentNodeId: 'drucker',
      currentItemStartedAt: now,
      isAnswerRevealed: true,
      queueNodeIds: ['drucker'],
      sessionStartedAt: now,
      totalNodeCount: 1
    },
    reviewSessionMode: 'reading-only'
  });
});

it('refreshes the active Flow queue immediately after enabling sequential reading', () => {
  expect(useWorkspaceStore.getState().setNodeSequentialReading('books', true, now)).toBe(true);
  const state = useWorkspaceStore.getState();

  expect(state.nodesById.books?.sequentialReadingEnabled).toBe(true);
  expect(state.nodesById.debugging?.reading?.state).toBe('active');
  expect(state.nodesById.drucker?.reading?.state).toBe('locked');
  expect(state.activeNodeId).toBe('debugging');
  expect(state.reviewSession.currentNodeId).toBe('debugging');
  expect(state.reviewSession.queueNodeIds).toEqual(['debugging']);
  expect(state.reviewSession.isAnswerRevealed).toBe(false);
});

it('falls back to the reading queue when refreshing a recommended Flow with no due cards', () => {
  useWorkspaceStore.setState({ reviewSessionMode: 'recommended' });

  expect(useWorkspaceStore.getState().setNodeSequentialReading('books', true, now)).toBe(true);
  const state = useWorkspaceStore.getState();

  expect(state.nodesById.debugging?.reading?.state).toBe('active');
  expect(state.nodesById.drucker?.reading?.state).toBe('locked');
  expect(state.activeNodeId).toBe('debugging');
  expect(state.reviewSession.currentNodeId).toBe('debugging');
  expect(state.reviewSession.queueNodeIds).toEqual(['debugging']);
});
