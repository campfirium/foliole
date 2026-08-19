import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  pairTestDevice,
  requestWorkspaceSyncServer,
  signWorkspaceSyncRequest
} from './lanWorkspaceSyncServer.testSupport.js';
import { decryptWorkgroupPayloadNode } from './workgroupAeadNode.js';

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.cwd()}/.tmp/foliole-companion-pairing-${Math.random().toString(16).slice(2)}`
}));
const WORKGROUP = vi.hoisted(() => ({
  groupId: 'group-test',
  groupKey: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
  groupTag: '630dcd2966c4336691125448bbb25b4f'
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

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: vi.fn(async (execute: () => unknown) => execute())
}));

vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: vi.fn(() => ({
    created_at: '2026-08-08T00:00:00.000Z',
    created_by_host_name: 'Maci',
    display_name: 'Foliole Desktop',
    group_id: 'group-test',
    local_host_name: 'Maci',
    local_member_state: 'active',
    members: [{
      approved_by_host_name: 'Maci', authorization_id: 'founder-local',
      host_name: 'Maci', host_platform: 'darwin',
      joined_at: '2026-08-08T00:00:00.000Z', state: 'active'
    }],
    timeline_id: 'timeline-test'
  })),
  loadSyncGroupMemberAuthorization: vi.fn(() => ({ state: 'active' })),
  registerSyncGroupMember: vi.fn((args: { authorizationId: string; hostName: string; hostPlatform: string }) => ({
    created_at: '2026-08-08T00:00:00.000Z', created_by_host_name: 'Maci',
    display_name: 'Foliole Desktop', group_id: 'group-test', local_host_name: 'Maci',
    local_member_state: 'active', timeline_id: 'timeline-test', members: [{
      approved_by_host_name: 'Maci', authorization_id: args.authorizationId,
      host_name: args.hostName, host_platform: args.hostPlatform,
      joined_at: '2026-08-08T00:00:01.000Z', state: 'active'
    }]
  }))
}));
vi.mock('./workgroupKeyStore.js', () => ({
  consumeDesktopWorkgroupNonce: vi.fn(() => true),
  loadDesktopWorkgroupKey: vi.fn(() => ({
    group_id: WORKGROUP.groupId, group_key: WORKGROUP.groupKey, group_tag: WORKGROUP.groupTag
  }))
}));

function workgroupJson(response: Awaited<ReturnType<typeof requestWorkspaceSyncServer>>, pathWithQuery: string) {
  const envelope = JSON.parse(response.body.toString('utf8'));
  const contentType = String(response.headers['X-Foliole-Original-Content-Type']);
  const body = decryptWorkgroupPayloadNode({
    context: { contentType, direction: 'response', groupTag: WORKGROUP.groupTag,
      method: 'GET', pathWithQuery },
    envelope, groupKey: WORKGROUP.groupKey
  });
  return JSON.parse(body.toString('utf8')) as Record<string, unknown>;
}

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
      group_display_name: 'Maci',
      pairing_mode: 'desktop-confirm',
      peer_id: 'desktop-local'
    });
    const unauthorizedResponse = await requestWorkspaceSyncServer(server, { path: '/companion/workspace-snapshot' });
    expect(unauthorizedResponse.status).toBe(401);
    const paired = await pairTestDevice(server, WORKGROUP);
    expect(getLanWorkspaceSyncServerStatus().paired_device_count).toBe(0);
    expect(getLanWorkspaceSyncServerStatus().pending_pair_request_count).toBe(0);
    const response = await requestWorkspaceSyncServer(server, {
      headers: signWorkspaceSyncRequest({
        deviceId: paired.device_id,
        groupId: WORKGROUP.groupId,
        method: 'GET',
        pathWithQuery: '/companion/workspace-snapshot',
        secret: paired.device_secret
      }),
      path: '/companion/workspace-snapshot'
    });
    expect(response.status).toBe(200);
    expect(workgroupJson(response, '/companion/workspace-snapshot')).toMatchObject({
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
    const paired = await pairTestDevice(server, WORKGROUP);
    const response = await requestWorkspaceSyncServer(server, {
      headers: signWorkspaceSyncRequest({
        deviceId: paired.device_id,
        groupId: WORKGROUP.groupId,
        method: 'GET',
        pathWithQuery: '/companion/workspace-version',
        secret: paired.device_secret
      }),
      path: '/companion/workspace-version'
    });
    expect(response.status).toBe(200);
    expect(workgroupJson(response, '/companion/workspace-version')).toMatchObject({
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
    const paired = await pairTestDevice(server, WORKGROUP);
    const headers = signWorkspaceSyncRequest({
      deviceId: paired.device_id,
      groupId: WORKGROUP.groupId,
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

function registerMdnsWarningTest() {
  it('keeps LAN sync running while exposing an mDNS advertisement failure', async () => {
    const { applyLanSyncMdnsWarning } = await import(
      './lanWorkspaceSyncServer.js'
    );

    expect(applyLanSyncMdnsWarning({
      advertised_urls: ['http://127.0.0.1:38641'],
      last_error: null,
      paired_device_count: 0,
      pending_pair_request_count: 0,
      port: 38641,
      state: 'running'
    }, new Error('multicast unavailable'))).toMatchObject({
      last_error: 'multicast unavailable',
      state: 'running'
    });
  });
}

describe('lan workspace sync server', () => {
  afterEach(resetLanWorkspaceSyncServerTestState);
  registerSnapshotProtectionTest();
  registerWorkspaceVersionProtectionTest();
  registerReplayProtectionTest();
  registerCapacitorCorsOriginTest();
  registerMdnsWarningTest();
});
