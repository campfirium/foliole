import { afterEach, describe, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.cwd()}/.tmp/foliole-companion-pairing-${Math.random().toString(16).slice(2)}`
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.userDataPath)
  },
  safeStorage: {
    decryptString: vi.fn((payload: Buffer) => payload.toString('utf8')),
    encryptString: vi.fn((payload: string) => Buffer.from(payload, 'utf8')),
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

async function resetLanWorkspaceSyncServerTestState() {
  const { stopLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');
  await stopLanWorkspaceSyncServer();
  const { clearCompanionPairRequests } = await import('./companionPairingRequests.js');
  const { clearCompanionRequestNonceCache } = await import('./companionRequestAuth.js');
  clearCompanionPairRequests();
  clearCompanionRequestNonceCache();
  delete process.env.FOLIOLE_COMPANION_SYNC_PORT;
}

describe('lan workspace sync server discovery boundary', () => {
  afterEach(resetLanWorkspaceSyncServerTestState);

  it('keeps unauthenticated discovery and health payloads minimal', async () => {
    process.env.FOLIOLE_COMPANION_SYNC_PORT = '38688';
    const { ensureLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');

    await ensureLanWorkspaceSyncServer({
      appVersion: '0.1.0-test',
      peerId: 'desktop-local'
    });

    const discoveryResponse = await fetch('http://127.0.0.1:38688/companion/discovery');
    expect(discoveryResponse.status).toBe(200);
    const discoveryPayload = await discoveryResponse.json() as Record<string, unknown>;
    expect(discoveryPayload).toMatchObject({
      desktop_name: 'Foliole Desktop',
      pairing_mode: 'desktop-confirm',
      peer_id: 'desktop-local'
    });
    expect(discoveryPayload).not.toHaveProperty('host_name');

    const healthResponse = await fetch('http://127.0.0.1:38688/health');
    expect(healthResponse.status).toBe(200);
    await expect(healthResponse.json()).resolves.toEqual({ ok: true });
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
