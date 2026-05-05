import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../database/workspaceSnapshot.js', () => ({
  loadWorkspaceSnapshot: vi.fn(() => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': {
        content: 'Hello from desktop.',
        id: 'node-1',
        title: 'Desktop node'
      }
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  }))
}));

describe('lan workspace sync server', () => {
  afterEach(async () => {
    const { stopLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');
    await stopLanWorkspaceSyncServer();
    delete process.env.FOLIOLE_COMPANION_SYNC_PORT;
  });

  it('serves the workspace snapshot payload over http', async () => {
    process.env.FOLIOLE_COMPANION_SYNC_PORT = '38679';
    const { ensureLanWorkspaceSyncServer, getLanWorkspaceSyncServerStatus } = await import('./lanWorkspaceSyncServer.js');

    const status = await ensureLanWorkspaceSyncServer({
      appVersion: '0.1.0-test',
      peerId: 'desktop-local'
    });

    expect(status.state).toBe('running');
    expect(getLanWorkspaceSyncServerStatus().port).toBe(38679);

    const response = await fetch('http://127.0.0.1:38679/companion/workspace-snapshot');
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      app_version: '0.1.0-test',
      peer_id: 'desktop-local',
      workspace_snapshot: {
        activeNodeId: 'node-1'
      }
    });
  });

  it('serves lightweight workspace version metadata over http', async () => {
    process.env.FOLIOLE_COMPANION_SYNC_PORT = '38679';
    const { ensureLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');

    await ensureLanWorkspaceSyncServer({
      appVersion: '0.1.0-test',
      peerId: 'desktop-local'
    });

    const response = await fetch('http://127.0.0.1:38679/companion/workspace-version');
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      app_version: '0.1.0-test',
      has_snapshot: true,
      peer_id: 'desktop-local'
    });
  });
});
