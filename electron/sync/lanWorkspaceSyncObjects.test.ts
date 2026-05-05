import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestPairingKeyPair, decryptTestPairingSecret } from './companionPairingProtocolTestSupport.js';
import { postSigned, signRequest } from './lanWorkspaceSyncObjects.testSupport.js';

const electronMock = vi.hoisted(() => ({
  userDataPath: `/tmp/foliole-sync-objects-${Math.random().toString(16).slice(2)}`
}));

const syncDatabaseMock = vi.hoisted(() => ({
  flushDirtyNodeSyncVersions: vi.fn(() => ['node-1']),
  loadSyncIndex: vi.fn(() => [{
    content_hash: 'setting-hash',
    object_id: 'setting:theme',
    object_type: 'setting',
    sync_version_id: null,
    updated_at: '2026-04-25T00:00:00.000Z'
  }]),
  loadSyncObjects: vi.fn(() => [{
    content_hash: 'setting-hash',
    deleted_at: null,
    object_id: 'setting:theme',
    object_type: 'setting',
    payload_json: '{}',
    updated_at: '2026-04-25T00:00:00.000Z'
  }]),
  loadSyncStateObjectsSince: vi.fn(() => [{
    content_hash: 'setting-hash',
    deleted_at: null,
    object_id: 'setting:theme',
    object_type: 'setting',
    payload_json: '{}',
    state_seq: 1,
    updated_at: '2026-04-25T00:00:00.000Z'
  }]),
  loadSyncNodeVersionsSince: vi.fn(() => [{
    object_id: 'node-1',
    object_type: 'node',
    snapshot: { id: 'node-1', title: 'Node 1' },
    version_created_at: '2026-04-25T00:03:00.000Z',
    version_id: 'desktop#1'
  }]),
  loadSyncReviewLogSince: vi.fn(() => [{
    op_id: 'op-1',
    reviewed_at: '2026-04-25T00:04:00.000Z'
  }])
}));
const workspaceSnapshotMock = vi.hoisted(() => ({
  loadWorkspaceSnapshot: vi.fn(() => null),
  loadWorkspaceVersionMetadata: vi.fn(() => ({ hasSnapshot: false, workspaceVersion: null }))
}));
const syncAppliedEventsMock = vi.hoisted(() => ({ notifyWorkspaceSyncApplied: vi.fn() }));

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => electronMock.userDataPath) },
  safeStorage: {
    decryptString: vi.fn((payload: Buffer) => payload.toString('utf8')),
    encryptString: vi.fn((payload: string) => Buffer.from(payload, 'utf8')),
    isEncryptionAvailable: vi.fn(() => true)
  }
}));

vi.mock('../database/workspaceSnapshot.js', () => ({
  loadWorkspaceSnapshot: workspaceSnapshotMock.loadWorkspaceSnapshot,
  loadWorkspaceVersionMetadata: workspaceSnapshotMock.loadWorkspaceVersionMetadata
}));
vi.mock('../database/syncIndex.js', () => ({ loadSyncIndex: syncDatabaseMock.loadSyncIndex }));
vi.mock('../database/syncObjects.js', () => ({
  loadSyncObjects: syncDatabaseMock.loadSyncObjects,
  loadSyncStateObjectsSince: syncDatabaseMock.loadSyncStateObjectsSince
}));
vi.mock('../database/syncNodes.js', () => ({ loadSyncNodeVersionsSince: syncDatabaseMock.loadSyncNodeVersionsSince }));
vi.mock('../database/syncReviewLog.js', () => ({
  loadSyncReviewLogSince: syncDatabaseMock.loadSyncReviewLogSince
}));
vi.mock('./workspaceSyncAppliedEvents.js', () => ({
  notifyWorkspaceSyncApplied: syncAppliedEventsMock.notifyWorkspaceSyncApplied
}));
vi.mock('../database/nodeSyncVersions.js', () => ({
  flushDirtyNodeSyncVersions: syncDatabaseMock.flushDirtyNodeSyncVersions
}));
async function pairDevice(endpoint: string) {
  const clientKeyPair = await createTestPairingKeyPair();
  const createResponse = await fetch(`${endpoint}/companion/pair-requests`, {
    body: JSON.stringify({
      device_id: 'android-test-device',
      device_kind: 'android',
      device_name: 'Pixel Test',
      pairing_public_key: clientKeyPair.publicKey
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  });
  const pairRequest = (await createResponse.json()) as { pair_request_id: string };
  const { approveCompanionPairRequest } = await import('./companionPairingRequests.js');
  approveCompanionPairRequest(pairRequest.pair_request_id);
  const finalizeResponse = await fetch(`${endpoint}/companion/pair`, {
    body: JSON.stringify({ pair_request_id: pairRequest.pair_request_id }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  });
  const payload = await finalizeResponse.json() as {
    device_id: string;
    encrypted_device_secret: Parameters<typeof decryptTestPairingSecret>[0]['encrypted'];
  };
  return {
    device_id: payload.device_id,
    device_secret: await decryptTestPairingSecret({
      encrypted: payload.encrypted_device_secret,
      privateKey: clientKeyPair.privateKey
    })
  };
}

async function resetTestState() {
  const { stopLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');
  await stopLanWorkspaceSyncServer();
  const { clearCompanionPairRequests } = await import('./companionPairingRequests.js');
  const { clearCompanionRequestNonceCache } = await import('./companionRequestAuth.js');
  clearCompanionPairRequests();
  clearCompanionRequestNonceCache();
  delete process.env.FOLIOLE_COMPANION_SYNC_PORT;
  fs.rmSync(electronMock.userDataPath, { force: true, recursive: true });
  electronMock.userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-sync-objects-'));
}

async function fetchSignedGet(endpoint: string, pathWithQuery: string, paired: { device_id: string; device_secret: string }) {
  return await fetch(`${endpoint}${pathWithQuery}`, {
    headers: signRequest({ deviceId: paired.device_id, method: 'GET', pathWithQuery, secret: paired.device_secret })
  });
}

async function expectRetiredGet(endpoint: string, pathWithQuery: string, paired: { device_id: string; device_secret: string }) {
  const response = await fetchSignedGet(endpoint, pathWithQuery, paired);
  expect(response.status).toBe(410);
  await expect(response.json()).resolves.toEqual({ error: 'sync_json_endpoint_retired' });
}

async function testRetiresSyncStreamsForPairedDevices() {
  process.env.FOLIOLE_COMPANION_SYNC_PORT = '38683';
  const { ensureLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');
  await ensureLanWorkspaceSyncServer({ appVersion: '0.1.0-test', peerId: 'desktop-local' });

  expect((await fetch('http://127.0.0.1:38683/companion/sync-index')).status).toBe(401);

  const endpoint = 'http://127.0.0.1:38683';
  const paired = await pairDevice('http://127.0.0.1:38683');
  await expectRetiredGet(endpoint, '/companion/sync-state?after_state_seq=0&limit=500', paired);
  await expectRetiredGet(endpoint, '/companion/sync-index', paired);
  await expectRetiredGet(endpoint, '/companion/sync-objects?object_type=setting&object_id=setting%3Atheme', paired);
  await expectRetiredGet(
    endpoint,
    '/companion/sync-node-versions?after_created_at=2026-04-25T00%3A00%3A00.000Z&after_change_id=desktop%230&limit=500',
    paired
  );
  await expectRetiredGet(
    endpoint,
    '/companion/sync-review-log?after_created_at=2026-04-25T00%3A00%3A00.000Z&after_change_id=op-0&limit=500',
    paired
  );
  expect(syncDatabaseMock.loadSyncStateObjectsSince).not.toHaveBeenCalled();
  expect(syncDatabaseMock.loadSyncIndex).not.toHaveBeenCalled();
  expect(syncDatabaseMock.loadSyncObjects).not.toHaveBeenCalled();
  expect(syncDatabaseMock.flushDirtyNodeSyncVersions).not.toHaveBeenCalled();
  expect(syncDatabaseMock.loadSyncNodeVersionsSince).not.toHaveBeenCalled();
  expect(syncDatabaseMock.loadSyncReviewLogSince).not.toHaveBeenCalled();
  expect(workspaceSnapshotMock.loadWorkspaceSnapshot).not.toHaveBeenCalled();
}

function buildMobileStateObjectsBody() {
  return JSON.stringify({
    objects: [{
      content_hash: 'hash-mobile-setting',
      deleted_at: null,
      object_id: 'mobile:android:phone:*:handoff',
      object_type: 'setting',
      payload_json: '{"key":"handoff"}',
      updated_at: '2026-04-25T00:10:00.000Z'
    }, {
      content_hash: 'hash-mobile-reading',
      deleted_at: null,
      object_id: 'node-1',
      object_type: 'node_reading',
      payload_json: '{"reading_position":128}',
      updated_at: '2026-04-25T00:11:00.000Z'
    }, {
      content_hash: 'hash-mobile-review',
      deleted_at: null,
      object_id: 'node-1',
      object_type: 'node_review',
      payload_json: '{"reps":4}',
      updated_at: '2026-04-25T00:12:00.000Z'
    }, {
      content_hash: 'hash-mobile-view',
      deleted_at: null,
      object_id: 'session_resume:android:phone:android-test-device:node:node-1',
      object_type: 'view_state',
      payload_json: '{"scroll_top":256}',
      updated_at: '2026-04-25T00:13:00.000Z'
    }]
  });
}

async function testRetiresPushedMobileStateObjects() {
  process.env.FOLIOLE_COMPANION_SYNC_PORT = '38684';
  const { ensureLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');
  await ensureLanWorkspaceSyncServer({ appVersion: '0.1.0-test', peerId: 'desktop-local' });
  const paired = await pairDevice('http://127.0.0.1:38684');

  const response = await postSigned(
    'http://127.0.0.1:38684',
    '/companion/sync-objects',
    buildMobileStateObjectsBody(),
    paired
  );

  expect(response.status).toBe(410);
  await expect(response.json()).resolves.toEqual({ error: 'sync_json_endpoint_retired' });
}

describe('lan workspace sync objects', () => {
  afterEach(resetTestState);

  it('requires pairing but retires legacy JSON sync GET streams', testRetiresSyncStreamsForPairedDevices);

  it('retires pushed mobile state objects from paired devices', testRetiresPushedMobileStateObjects);
});
