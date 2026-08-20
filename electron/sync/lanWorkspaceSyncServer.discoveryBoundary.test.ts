import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestWorkspaceSyncServer } from './lanWorkspaceSyncServer.testSupport.js';

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.cwd()}/.tmp/foliole-companion-pairing-${Math.random().toString(16).slice(2)}`
}));
const workgroupKeyMock = vi.hoisted(() => ({
  group_key: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
  group_tag: '630dcd2966c4336691125448bbb25b4f'
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.userDataPath)
  },
  safeStorage: {
    decryptString: vi.fn((payload: Buffer) => payload.toString('utf8')),
    encryptString: vi.fn((payload: string) => Buffer.from(payload, 'utf8')),
    getSelectedStorageBackend: vi.fn(() => 'gnome_libsecret'),
    isEncryptionAvailable: vi.fn(() => true)
  }
}));

vi.mock('./companionMdnsAdvertisement.js', () => ({
  startCompanionMdnsAdvertisement: vi.fn(),
  stopCompanionMdnsAdvertisement: vi.fn()
}));

vi.mock('../database/workspaceSnapshot.js', () => ({
  loadWorkspaceSnapshot: vi.fn(() => null),
  loadWorkspaceVersionMetadata: vi.fn(() => ({
    hasSnapshot: true,
    workspaceVersion: '2026-04-25T00:00:00.000Z'
  }))
}));

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: vi.fn(async (execute: () => unknown) => execute())
}));

vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: vi.fn(() => ({
    created_at: '2026-08-08T00:00:00.000Z',
    created_by_host_name: 'Foliole Desktop',
    display_name: 'Foliole Desktop',
    group_id: 'group-test',
    local_host_name: 'Foliole Desktop',
    local_member_state: 'active',
    members: [{
      approved_by_host_name: 'Foliole Desktop',
      authorization_id: 'desktop-local',
      host_name: 'Foliole Desktop',
      host_platform: 'macOS',
      joined_at: '2026-08-08T00:00:00.000Z',
      state: 'active'
    }],
    timeline_id: 'timeline-test'
  }))
}));

vi.mock('./workgroupKeyStore.js', () => ({
  loadDesktopWorkgroupKey: vi.fn(() => workgroupKeyMock)
}));

async function resetLanWorkspaceSyncServerTestState() {
  const { clearCompanionPairRequests } = await import('./companionPairingRequests.js');
  const { clearCompanionRequestNonceCache } = await import('./companionRequestAuth.js');
  clearCompanionPairRequests();
  clearCompanionRequestNonceCache();
}

describe('lan workspace sync server discovery boundary', () => {
  afterEach(resetLanWorkspaceSyncServerTestState);

  it('keeps unauthenticated discovery and health payloads minimal', async () => {
    const { createWorkspaceSyncHttpServer } = await import('./lanWorkspaceSyncServer.js');
    const server = createWorkspaceSyncHttpServer({
      appVersion: '0.1.0-test',
      peerId: 'desktop-local'
    });
    const discoveryResponse = await requestWorkspaceSyncServer(server, { path: '/companion/discovery' });
    expect(discoveryResponse.status).toBe(200);
    const discoveryPayload = discoveryResponse.json<Record<string, unknown>>();
    expect(discoveryPayload).toMatchObject({
      desktop_name: 'Foliole Desktop',
      pairing_mode: 'desktop-confirm',
      peer_id: 'desktop-local'
    });
    expect(discoveryPayload).not.toHaveProperty('host_name');

    const healthResponse = await requestWorkspaceSyncServer(server, { path: '/health' });
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.json()).toEqual({ ok: true });
  });

  it('uses bounded local-network HTTP server timeouts', async () => {
    const { createWorkspaceSyncHttpServer, LAN_WORKSPACE_SYNC_HTTP_LIMITS } = await import('./lanWorkspaceSyncServer.js');
    const server = createWorkspaceSyncHttpServer({
      appVersion: '0.1.0-test',
      peerId: 'desktop-local'
    });

    expect(server.headersTimeout).toBe(LAN_WORKSPACE_SYNC_HTTP_LIMITS.headersTimeout);
    expect(server.keepAliveTimeout).toBe(LAN_WORKSPACE_SYNC_HTTP_LIMITS.keepAliveTimeout);
    expect(server.requestTimeout).toBe(LAN_WORKSPACE_SYNC_HTTP_LIMITS.requestTimeout);
  });
});
