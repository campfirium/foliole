import { describe, expect, it, beforeEach } from 'vitest';

import {
  createInitialWorkspaceState,
  useWorkspaceStore,
  WORKSPACE_STORAGE_KEY
} from './workspaceStore';

function resetWorkspaceState() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
}

describe('workspace persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    resetWorkspaceState();
  });

  it('writes workspace changes into localStorage', async () => {
    useWorkspaceStore.getState().updateNodeContent('node-1', 'Persisted markdown');
    await Promise.resolve();

    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    expect(raw).not.toBeNull();

    const payload = raw ? (JSON.parse(raw) as { state: ReturnType<typeof createInitialWorkspaceState> }) : null;
    expect(payload?.state.nodesById['node-1']?.content).toBe('Persisted markdown');
  });

  it('rehydrates workspace state from localStorage', async () => {
    const persisted = createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z'));
    persisted.nodesById['node-1'] = {
      ...persisted.nodesById['node-1'],
      content: 'Recovered markdown',
      updatedAt: '2026-02-25T00:00:01.000Z'
    };

    useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-24T00:00:00.000Z')));
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ state: persisted, version: 0 }));

    await useWorkspaceStore.persist.rehydrate();

    expect(useWorkspaceStore.getState().nodesById['node-1']?.content).toBe('Recovered markdown');
  });
});
