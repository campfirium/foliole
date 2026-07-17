import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  pairTestDevice,
  requestWorkspaceSyncServer,
  signWorkspaceSyncRequest
} from './lanWorkspaceSyncServer.testSupport.js';

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
  loadWorkspaceVersionMetadata: vi.fn(() => ({
    hasSnapshot: true,
    workspaceVersion: '2026-04-25T00:00:00.000Z'
  })),
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

async function resetLanWorkspaceSyncServerTestState() {
  const { clearCompanionPairRequests } = await import('./companionPairingRequests.js');
  const { clearCompanionRequestNonceCache } = await import('./companionRequestAuth.js');
  clearCompanionPairRequests();
  clearCompanionRequestNonceCache();
  fs.rmSync(electronMock.userDataPath, { force: true, recursive: true });
  electronMock.userDataPath = fs.mkdtempSync(path.join(process.cwd(), '.tmp', 'foliole-companion-pairing-'));
}

function registerSnapshotProtectionTest() {
  it('requires pairing and signed headers before serving the workspace snapshot', async () => {
    const { createWorkspaceSyncHttpServer, getLanWorkspaceSyncServerStatus } = await import('./lanWorkspaceSyncServer.js');
    const server = createWorkspaceSyncHttpServer({
      appVersion: '0.1.0-test',
      peerId: 'desktop-local'
    });
    const discoveryResponse = await requestWorkspaceSyncServer(server, { path: '/companion/discovery' });
    expect(discoveryResponse.status).toBe(200);
    expect(discoveryResponse.json()).toMatchObject({
      desktop_name: 'Foliole Desktop',
      pairing_mode: 'desktop-confirm',
      peer_id: 'desktop-local'
    });
    const unauthorizedResponse = await requestWorkspaceSyncServer(server, { path: '/companion/workspace-snapshot' });
    expect(unauthorizedResponse.status).toBe(401);
    const paired = await pairTestDevice(server);
    expect(getLanWorkspaceSyncServerStatus().paired_device_count).toBe(1);
    expect(getLanWorkspaceSyncServerStatus().pending_pair_request_count).toBe(0);
    const response = await requestWorkspaceSyncServer(server, {
      headers: signWorkspaceSyncRequest({
        deviceId: paired.device_id,
        method: 'GET',
        pathWithQuery: '/companion/workspace-snapshot',
        secret: paired.device_secret
      }),
      path: '/companion/workspace-snapshot'
    });
    expect(response.status).toBe(200);
    expect(response.json()).toMatchObject({
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
    const { createWorkspaceSyncHttpServer } = await import('./lanWorkspaceSyncServer.js');
    const server = createWorkspaceSyncHttpServer({
      appVersion: '0.1.0-test',
      peerId: 'desktop-local'
    });
    const paired = await pairTestDevice(server);
    const response = await requestWorkspaceSyncServer(server, {
      headers: signWorkspaceSyncRequest({
        deviceId: paired.device_id,
        method: 'GET',
        pathWithQuery: '/companion/workspace-version',
        secret: paired.device_secret
      }),
      path: '/companion/workspace-version'
    });
    expect(response.status).toBe(200);
    expect(response.json()).toMatchObject({
      app_version: '0.1.0-test',
      has_snapshot: true,
      peer_id: 'desktop-local'
    });
  });
}

function registerReplayProtectionTest() {
  it('rejects replayed signed requests', async () => {
    const { createWorkspaceSyncHttpServer } = await import('./lanWorkspaceSyncServer.js');
    const server = createWorkspaceSyncHttpServer({
      appVersion: '0.1.0-test',
      peerId: 'desktop-local'
    });
    const paired = await pairTestDevice(server);
    const headers = signWorkspaceSyncRequest({
      deviceId: paired.device_id,
      method: 'GET',
      pathWithQuery: '/companion/workspace-version',
      secret: paired.device_secret
    });

    expect(
      (await requestWorkspaceSyncServer(server, { headers, path: '/companion/workspace-version' })).status
    ).toBe(200);
    expect(
      (await requestWorkspaceSyncServer(server, { headers, path: '/companion/workspace-version' })).status
    ).toBe(409);
  });
}


function registerCapacitorCorsOriginTest() {
  it('allows Capacitor localhost origins used by Android WebView discovery', async () => {
    const { createWorkspaceSyncHttpServer } = await import('./lanWorkspaceSyncServer.js');
    const server = createWorkspaceSyncHttpServer({
      appVersion: '0.1.0-test',
      peerId: 'desktop-local'
    });
    for (const origin of ['capacitor://localhost', 'http://localhost', 'https://localhost']) {
      const response = await requestWorkspaceSyncServer(server, {
        headers: { Origin: origin },
        path: '/companion/discovery'
      });
      expect(response.status).toBe(200);
      expect(response.headers['Access-Control-Allow-Origin']).toBe(origin);
    }
  });
}

describe('lan workspace sync server', () => {
  afterEach(resetLanWorkspaceSyncServerTestState);
  registerSnapshotProtectionTest();
  registerWorkspaceVersionProtectionTest();
  registerReplayProtectionTest();
  registerCapacitorCorsOriginTest();
});
