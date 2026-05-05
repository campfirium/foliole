import { describe, expect, it, beforeEach } from 'vitest';

import {
  createInitialWorkspaceState,
  useWorkspaceStore,
  WORKSPACE_STORAGE_KEY
} from './workspaceStore';

function resetWorkspaceState() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
}

describe('workspace persistence storage', () => {
  beforeEach(() => {
    localStorage.clear();
    resetWorkspaceState();
  });

  it('writes workspace changes into localStorage', async () => {
    useWorkspaceStore.getState().updateNodeContent('node-1', 'Persisted markdown');
    const createdNodeId = useWorkspaceStore.getState().createRootNode('Trash me');
    useWorkspaceStore.getState().deleteNode(createdNodeId);
    await Promise.resolve();

    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    expect(raw).not.toBeNull();

    const payload = raw ? (JSON.parse(raw) as { state: ReturnType<typeof createInitialWorkspaceState> }) : null;
    expect(payload?.state.nodesById['node-1']?.content).toBe('Persisted markdown');
    expect(payload?.state.trashedNodeIds).toContain(createdNodeId);
  });

  it('rehydrates workspace state from localStorage', async () => {
    const persisted = createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z'));
    persisted.nodesById['node-1'] = {
      ...persisted.nodesById['node-1'],
      content: 'Recovered markdown',
      updatedAt: '2026-02-25T00:00:01.000Z'
    };
    persisted.trashedNodeIds = ['node-1'];

    useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-24T00:00:00.000Z')));
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ state: persisted, version: 0 }));

    await useWorkspaceStore.persist.rehydrate();

    expect(useWorkspaceStore.getState().nodesById['node-1']?.content).toBe('Recovered markdown');
    expect(useWorkspaceStore.getState().trashedNodeIds).toEqual(['node-1']);
  });
});

describe('workspace persistence renderer boundary', () => {
  beforeEach(() => {
    localStorage.clear();
    resetWorkspaceState();
  });

  it('rehydrates only the active node document from persisted workspace payload', async () => {
    const persisted = createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z'));
    persisted.activeNodeId = 'node-2';
    persisted.nodeOrder = ['node-1', 'node-2'];
    persisted.nodesById['node-1'] = {
      ...persisted.nodesById['node-1'],
      content: 'Recovered node 1 body',
      hasContent: true,
      reveal: 'Recovered node 1 answer',
      hasReveal: true,
      updatedAt: '2026-02-25T00:00:01.000Z'
    };
    persisted.nodesById['node-2'] = {
      ...persisted.nodesById['node-2'],
      content: 'Recovered node 2 body',
      hasContent: true,
      reveal: 'Recovered node 2 answer',
      hasReveal: true,
      updatedAt: '2026-02-25T00:00:02.000Z'
    };

    useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-24T00:00:00.000Z')));
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ state: persisted, version: 0 }));

    await useWorkspaceStore.persist.rehydrate();

    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
    expect(useWorkspaceStore.getState().nodesById['node-1']).toMatchObject({
      content: '',
      hasContent: true,
      reveal: null,
      hasReveal: true
    });
    expect(useWorkspaceStore.getState().nodesById['node-2']).toMatchObject({
      content: 'Recovered node 2 body',
      hasContent: true,
      reveal: 'Recovered node 2 answer',
      hasReveal: true
    });
  });
});
