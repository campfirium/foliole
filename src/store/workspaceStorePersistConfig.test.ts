import { expect, it } from 'vitest';

import { HOME_NODE_ID, INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';
import { createWorkspaceStorePersistConfig } from './workspaceStorePersistConfig';
import { createPersistedTopicNode } from './workspaceStorePersistConfig.test-support';

function createConfig() {
  return createWorkspaceStorePersistConfig(() => undefined);
}

function mergePersistedState(persistedState: unknown) {
  const current = createTestWorkspaceState();
  return createConfig().merge?.(persistedState, current) ?? current;
}

function createTestWorkspaceState() {
  return {
    ...useWorkspaceStore.getState(),
    ...createInitialWorkspaceState(new Date('2026-05-13T00:00:00.000Z'))
  };
}

it('roundtrips a partialized persisted workspace payload through merge', () => {
  const current = createTestWorkspaceState();
  const persisted = {
    ...current,
    activeNodeId: INBOX_NODE_ID,
    reviewSession: {
      currentNodeId: INBOX_NODE_ID,
      isAnswerRevealed: true,
      nextReviewDueAt: '2026-05-14T09:30:00.000Z',
      queueNodeIds: [INBOX_NODE_ID],
      totalNodeCount: 1
    },
    layout: {
      ...current.layout,
      documentMaxWidth: 920,
      listWidth: 360
    },
    nodeViewById: {
      'node-1': {
        scrollTop: 42,
        selection: { from: 1, to: 4 },
        updatedAt: '2026-05-13T00:00:01.000Z'
      }
    }
  };
  const partialized = createConfig().partialize?.(persisted);

  const merged = createConfig().merge?.(
    JSON.parse(JSON.stringify(partialized)),
    current
  );

  expect(merged?.activeNodeId).toBe(INBOX_NODE_ID);
  expect(merged?.layout).toMatchObject({ documentMaxWidth: 920, listWidth: 360 });
  expect(merged?.nodeViewById['node-1']).toMatchObject({
    scrollTop: 42,
    selection: { from: 1, to: 4 }
  });
  expect(merged?.reviewSession).toMatchObject({
    currentNodeId: INBOX_NODE_ID,
    isAnswerRevealed: true,
    nextReviewDueAt: '2026-05-14T09:30:00.000Z',
    queueNodeIds: [INBOX_NODE_ID],
    totalNodeCount: 1
  });
  expect(partialized).not.toHaveProperty('reviewSessionMode');
  expect(merged?.reviewSessionMode).toBe('recommended');
  expect(merged?.nodesById[INBOX_NODE_ID]?.id).toBe(INBOX_NODE_ID);
});

it('keeps all node documents in web fallback persisted payloads', () => {
  const current = createTestWorkspaceState();
  const state = {
    ...current,
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': createPersistedTopicNode('node-1', {
        content: 'Active node body',
        hasContent: true
      }),
      'node-2': createPersistedTopicNode('node-2', {
        content: 'Inactive imported Markdown body',
        hasContent: true,
        hasReveal: true,
        reveal: 'Inactive answer'
      })
    }
  };

  const partialized = createConfig().partialize?.(state);

  expect(partialized?.nodesById['node-2']).toMatchObject({
    content: 'Inactive imported Markdown body',
    reveal: 'Inactive answer'
  });
});

it('drops invalid persisted review next due values', () => {
  const current = createTestWorkspaceState();
  const merged = createConfig().merge?.(
    {
      activeNodeId: INBOX_NODE_ID,
      nodeOrder: current.nodeOrder,
      nodesById: current.nodesById,
      reviewSession: {
        currentNodeId: INBOX_NODE_ID,
        isAnswerRevealed: true,
        nextReviewDueAt: 'not-a-date',
        queueNodeIds: [INBOX_NODE_ID],
        totalNodeCount: 1
      }
    },
    current
  );

  expect(merged?.reviewSession.nextReviewDueAt).toBeUndefined();
});

it('keeps completed review session summary through hydration', () => {
  const current = createTestWorkspaceState();
  const merged = createConfig().merge?.(
    {
      activeNodeId: INBOX_NODE_ID,
      nodeOrder: current.nodeOrder,
      nodesById: current.nodesById,
      reviewSession: {
        completedAt: '2026-05-13T00:30:00.000Z',
        currentNodeId: null,
        isAnswerRevealed: false,
        queueNodeIds: [],
        readTopicCount: 2,
        readingElapsedMs: 120000,
        reviewedItemCount: 3,
        reviewElapsedMs: 180000,
        totalNodeCount: 5
      }
    },
    current
  );

  expect(merged?.reviewSession).toMatchObject({
    completedAt: '2026-05-13T00:30:00.000Z',
    currentNodeId: null,
    queueNodeIds: [],
    readTopicCount: 2,
    reviewedItemCount: 3,
    totalNodeCount: 5
  });
});

it('does not hydrate legacy persisted temporary session mode', () => {
  const current = createTestWorkspaceState();
  const merged = createConfig().merge?.(
    {
      activeNodeId: INBOX_NODE_ID,
      nodeOrder: current.nodeOrder,
      nodesById: current.nodesById,
      reviewSessionMode: 'reading-only'
    },
    current
  );

  expect(merged?.reviewSessionMode).toBe('recommended');
});

it.each([null, 'bad-payload', []])(
  'ignores non-object persisted workspace payloads',
  (persistedState) => {
    const merged = mergePersistedState(persistedState);

    expect(merged.activeNodeId).toBeNull();
    expect(merged.nodeOrder).toContain(INBOX_NODE_ID);
    expect(merged.nodesById[INBOX_NODE_ID]?.id).toBe(INBOX_NODE_ID);
  }
);

it('ignores missing workspace fields instead of hydrating partial shadows', () => {
  const merged = mergePersistedState({
    activeNodeId: INBOX_NODE_ID
  });

  expect(merged.activeNodeId).toBeNull();
  expect(merged.nodesById[INBOX_NODE_ID]?.id).toBe(INBOX_NODE_ID);
});

it('rejects a partially invalid persisted layout as one block', () => {
  const current = createTestWorkspaceState();
  const merged = createConfig().merge?.(
    {
      layout: {
        ...current.layout,
        listWidth: 'wide'
      }
    },
    current
  );

  expect(merged?.layout).toEqual(current.layout);
});

it('drops invalid node entries and does not activate missing nodes', () => {
  const merged = mergePersistedState({
    activeNodeId: 'node-2',
    nodeOrder: ['node-2'],
    nodesById: {
      'node-2': 1
    }
  });

  expect(merged.activeNodeId).toBeNull();
  expect(merged.nodeOrder).not.toContain('node-2');
  expect(merged.nodesById['node-2']!).toBeUndefined();
});

it('ignores an active node id that is absent from the persisted nodes', () => {
  const current = createTestWorkspaceState();
  const merged = createConfig().merge?.(
    {
      activeNodeId: 'missing-node',
      nodesById: current.nodesById,
      nodeOrder: current.nodeOrder
    },
    current
  );

  expect(merged?.activeNodeId).toBe(HOME_NODE_ID);
  expect(merged?.nodesById[INBOX_NODE_ID]?.id).toBe(INBOX_NODE_ID);
});
