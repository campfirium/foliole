import { beforeEach, expect, it } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore, WORKSPACE_STORAGE_KEY } from './workspaceStore';
import { withWorkspaceRendererBoundary } from './workspaceStoreRendererBoundary';

function createFolder(id: string) {
  const seed = createInitialWorkspaceState(new Date('2026-07-22T00:00:00.000Z')).nodesById['node-1']!;
  return { ...seed, content: '', id, kind: 'folder' as const, parentNodeId: null, review: null, title: id };
}

function createReadingTopic(id: string, parentNodeId: string) {
  const seed = createInitialWorkspaceState(new Date('2026-07-22T00:00:00.000Z')).nodesById['node-1']!;
  return {
    ...seed,
    id,
    kind: 'topic' as const,
    parentNodeId,
    reading: {
      intervalDurationMs: 0,
      intervalGrowthFactor: 1,
      lastHandledAt: '2026-04-08T00:00:00.000Z',
      nextAt: '2026-07-22T00:00:00.000Z',
      priority: 5 as const,
      readingPosition: 0,
      repetitionCount: 0,
      state: 'active' as const
    },
    review: null,
    title: id
  };
}

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-07-21T00:00:00.000Z')));
});

it('repairs a restored review topic whose persisted browse root points at another folder', async () => {
  const persisted = createInitialWorkspaceState(new Date('2026-07-22T00:00:00.000Z'));
  const inboxTopic = createReadingTopic('inbox-topic', 'folder-inbox');
  persisted.activeNodeId = inboxTopic.id;
  persisted.browseRootNodeId = 'folder-issue';
  persisted.nodeOrder = ['folder-inbox', inboxTopic.id, 'folder-issue'];
  persisted.nodesById = {
    'folder-inbox': createFolder('folder-inbox'),
    [inboxTopic.id]: inboxTopic,
    'folder-issue': createFolder('folder-issue')
  };
  persisted.reviewSession = {
    currentNodeId: inboxTopic.id,
    isAnswerRevealed: false,
    queueNodeIds: [inboxTopic.id],
    totalNodeCount: 1
  };
  localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ state: persisted, version: 0 }));

  await useWorkspaceStore.persist.rehydrate();

  expect(useWorkspaceStore.getState()).toMatchObject({
    activeNodeId: inboxTopic.id,
    browseRootNodeId: 'folder-inbox',
    reviewSession: { currentNodeId: inboxTopic.id }
  });
});

it('aligns the browse root when a review transition activates a topic in another folder', () => {
  const current = { ...useWorkspaceStore.getState() };
  const inboxTopic = createReadingTopic('inbox-topic', 'folder-inbox');
  current.activeNodeId = 'issue-topic';
  current.browseRootNodeId = 'folder-issue';
  current.nodeOrder = ['folder-inbox', inboxTopic.id, 'folder-issue', 'issue-topic'];
  current.nodesById = {
    'folder-inbox': createFolder('folder-inbox'),
    [inboxTopic.id]: inboxTopic,
    'folder-issue': createFolder('folder-issue'),
    'issue-topic': createReadingTopic('issue-topic', 'folder-issue')
  };

  const patch = withWorkspaceRendererBoundary({
    activeNodeId: inboxTopic.id,
    reviewSession: {
      currentNodeId: inboxTopic.id,
      isAnswerRevealed: false,
      queueNodeIds: [inboxTopic.id],
      totalNodeCount: 1
    }
  }, current);

  expect(patch).toMatchObject({
    activeNodeId: inboxTopic.id,
    browseRootNodeId: 'folder-inbox'
  });
});
