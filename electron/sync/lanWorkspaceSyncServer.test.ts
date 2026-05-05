import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  userDataPath: `/tmp/foliole-companion-pairing-${Math.random().toString(16).slice(2)}`
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

function signRequest(args: { deviceId: string; method: string; pathWithQuery: string; secret: string }) {
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const bodyHash = crypto.createHash('sha256').update('').digest('hex');
  const canonical = [args.method, args.pathWithQuery, timestamp, nonce, bodyHash].join('\n');
  return {
    'X-Device-Id': args.deviceId,
    'X-Nonce': nonce,
    'X-Signature': crypto.createHmac('sha256', args.secret).update(canonical).digest('hex'),
    'X-Timestamp': timestamp
  };
}

async function pairDevice(endpoint: string) {
  const createResponse = await fetch(`${endpoint}/companion/pair-requests`, {
    body: JSON.stringify({
      device_id: 'android-test-device',
      device_kind: 'android',
      device_name: 'Pixel Test'
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  });
  expect(createResponse.status).toBe(202);
  const pairRequest = (await createResponse.json()) as { pair_request_id: string };
  const { approveCompanionPairRequest } = await import('./companionPairingRequests.js');
  expect(approveCompanionPairRequest(pairRequest.pair_request_id)).toMatchObject({
    pair_request_id: pairRequest.pair_request_id,
    status: 'approved'
  });

  const finalizeResponse = await fetch(`${endpoint}/companion/pair`, {
    body: JSON.stringify({
      pair_request_id: pairRequest.pair_request_id
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  });
  expect(finalizeResponse.status).toBe(200);
  return (await finalizeResponse.json()) as { device_id: string; device_secret: string };
}

async function resetLanWorkspaceSyncServerTestState() {
  const { stopLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');
  await stopLanWorkspaceSyncServer();
  const { clearCompanionPairRequests } = await import('./companionPairingRequests.js');
  const { clearCompanionRequestNonceCache } = await import('./companionRequestAuth.js');
  clearCompanionPairRequests();
  clearCompanionRequestNonceCache();
  delete process.env.FOLIOLE_COMPANION_SYNC_PORT;
  fs.rmSync(electronMock.userDataPath, { force: true, recursive: true });
  electronMock.userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-companion-pairing-'));
}

function registerSnapshotProtectionTest() {
  it('requires pairing and signed headers before serving the workspace snapshot', async () => {
    process.env.FOLIOLE_COMPANION_SYNC_PORT = '38679';
    const { ensureLanWorkspaceSyncServer, getLanWorkspaceSyncServerStatus } = await import('./lanWorkspaceSyncServer.js');

    const status = await ensureLanWorkspaceSyncServer({
      appVersion: '0.1.0-test',
      peerId: 'desktop-local'
    });

    expect(status.state).toBe('running');
    expect(status.pending_pair_request_count).toBe(0);
    expect(getLanWorkspaceSyncServerStatus().port).toBe(38679);

    const discoveryResponse = await fetch('http://127.0.0.1:38679/companion/discovery');
    expect(discoveryResponse.status).toBe(200);
    await expect(discoveryResponse.json()).resolves.toMatchObject({
      desktop_name: 'Foliole Desktop',
      pairing_mode: 'desktop-confirm',
      peer_id: 'desktop-local'
    });

    const unauthorizedResponse = await fetch('http://127.0.0.1:38679/companion/workspace-snapshot');
    expect(unauthorizedResponse.status).toBe(401);

    const paired = await pairDevice('http://127.0.0.1:38679');
    expect(getLanWorkspaceSyncServerStatus().paired_device_count).toBe(1);
    expect(getLanWorkspaceSyncServerStatus().pending_pair_request_count).toBe(0);
    const response = await fetch('http://127.0.0.1:38679/companion/workspace-snapshot', {
      headers: signRequest({
        deviceId: paired.device_id,
        method: 'GET',
        pathWithQuery: '/companion/workspace-snapshot',
        secret: paired.device_secret
      })
    });
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
}

function registerWorkspaceVersionProtectionTest() {
  it('serves lightweight workspace version metadata for paired devices', async () => {
    process.env.FOLIOLE_COMPANION_SYNC_PORT = '38680';
    const { ensureLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');

    const status = await ensureLanWorkspaceSyncServer({
      appVersion: '0.1.0-test',
      peerId: 'desktop-local'
    });

    expect(status.pending_pair_request_count).toBe(0);
    const paired = await pairDevice('http://127.0.0.1:38680');
    const response = await fetch('http://127.0.0.1:38680/companion/workspace-version', {
      headers: signRequest({
        deviceId: paired.device_id,
        method: 'GET',
        pathWithQuery: '/companion/workspace-version',
        secret: paired.device_secret
      })
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      app_version: '0.1.0-test',
      has_snapshot: true,
      peer_id: 'desktop-local'
    });
  });
}

function registerReplayProtectionTest() {
  it('rejects replayed signed requests', async () => {
    process.env.FOLIOLE_COMPANION_SYNC_PORT = '38681';
    const { ensureLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');
    const status = await ensureLanWorkspaceSyncServer({
      appVersion: '0.1.0-test',
      peerId: 'desktop-local'
    });
    expect(status.pending_pair_request_count).toBe(0);
    const paired = await pairDevice('http://127.0.0.1:38681');
    const headers = signRequest({
      deviceId: paired.device_id,
      method: 'GET',
      pathWithQuery: '/companion/workspace-version',
      secret: paired.device_secret
    });

    expect(
      (await fetch('http://127.0.0.1:38681/companion/workspace-version', { headers })).status
    ).toBe(200);
    expect(
      (await fetch('http://127.0.0.1:38681/companion/workspace-version', { headers })).status
    ).toBe(409);
  });
}

describe('lan workspace sync server', () => {
  afterEach(resetLanWorkspaceSyncServerTestState);
  registerSnapshotProtectionTest();
  registerWorkspaceVersionProtectionTest();
  registerReplayProtectionTest();
});
