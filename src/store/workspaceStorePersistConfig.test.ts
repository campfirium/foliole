import { expect, it } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';
import { createWorkspaceStorePersistConfig } from './workspaceStorePersistConfig';

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
      queueNodeIds: [INBOX_NODE_ID],
      totalNodeCount: 1
    },
    reviewSessionMode: 'reading-only' as const,
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
    queueNodeIds: [INBOX_NODE_ID],
    totalNodeCount: 1
  });
  expect(merged?.reviewSessionMode).toBe('reading-only');
  expect(merged?.nodesById[INBOX_NODE_ID]?.id).toBe(INBOX_NODE_ID);
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
  expect(merged.nodeOrder).toContain('node-2');
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

  expect(merged?.activeNodeId).toBeNull();
  expect(merged?.nodesById[INBOX_NODE_ID]?.id).toBe(INBOX_NODE_ID);
});
