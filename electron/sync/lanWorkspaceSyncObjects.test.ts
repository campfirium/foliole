import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { postSigned, readWorkgroupResponse, signRequest } from './lanWorkspaceSyncObjects.testSupport.js';
import {
  pairTestDevice, requestWorkspaceSyncServer, type TestPairedDevice
} from './lanWorkspaceSyncServer.testSupport.js';

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.cwd()}/.tmp/foliole-sync-objects-${Math.random().toString(16).slice(2)}`
}));
const WORKGROUP = vi.hoisted(() => ({
  groupId: 'group-test', groupKey: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
  groupTag: '630dcd2966c4336691125448bbb25b4f'
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
    getSelectedStorageBackend: vi.fn(() => 'gnome_libsecret'),
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
vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: vi.fn(() => ({
    group_id: WORKGROUP.groupId, local_member_state: 'active', timeline_id: 'timeline-test', members: []
  })),
  loadSyncGroupMemberAuthorization: vi.fn(() => ({ state: 'active' })),
  registerSyncGroupMember: vi.fn((args: { authorizationId: string; deviceName: string }) => ({
    group_id: WORKGROUP.groupId, local_member_state: 'active', timeline_id: 'timeline-test', members: [{
      authorization_id: args.authorizationId, device_id: args.deviceName, device_kind: 'android',
      device_name: args.deviceName, state: 'active'
    }]
  }))
}));
vi.mock('./workgroupKeyStore.js', () => ({
  consumeDesktopWorkgroupNonce: vi.fn(() => true),
  loadDesktopWorkgroupKey: vi.fn(() => ({
    group_id: WORKGROUP.groupId, group_key: WORKGROUP.groupKey, group_tag: WORKGROUP.groupTag
  }))
}));
async function resetTestState() {
  const { clearCompanionPairRequests } = await import('./companionPairingRequests.js');
  const { clearCompanionRequestNonceCache } = await import('./companionRequestAuth.js');
  clearCompanionPairRequests();
  clearCompanionRequestNonceCache();
  fs.rmSync(electronMock.userDataPath, { force: true, recursive: true });
  electronMock.userDataPath = fs.mkdtempSync(path.join(process.cwd(), '.tmp', 'foliole-sync-objects-'));
}

async function fetchSignedGet(server: http.Server, pathWithQuery: string, paired: TestPairedDevice) {
  const response = await requestWorkspaceSyncServer(server, {
    headers: signRequest({ deviceId: paired.device_id,
      ...(paired.group_id ? { groupId: paired.group_id } : {}),
      method: 'GET', pathWithQuery, secret: paired.device_secret }),
    path: pathWithQuery
  });
  return readWorkgroupResponse(response, 'GET', pathWithQuery, paired);
}

async function expectRetiredGet(server: http.Server, pathWithQuery: string, paired: TestPairedDevice) {
  const response = await fetchSignedGet(server, pathWithQuery, paired);
  expect(response.status).toBe(410);
  expect(response.json()).toEqual({ error: 'sync_json_endpoint_retired' });
}

async function testRetiresSyncStreamsForPairedDevices() {
  const { createWorkspaceSyncHttpServer } = await import('./lanWorkspaceSyncServer.js');
  const server = createWorkspaceSyncHttpServer({ appVersion: '0.1.0-test', peerId: 'desktop-local' });
  expect((await requestWorkspaceSyncServer(server, { path: '/companion/sync-index' })).status).toBe(401);
  const paired = await pairTestDevice(server, WORKGROUP);
  await expectRetiredGet(server, '/companion/sync-state?after_state_seq=0&limit=500', paired);
  await expectRetiredGet(server, '/companion/sync-index', paired);
  await expectRetiredGet(server, '/companion/sync-objects?object_type=setting&object_id=setting%3Atheme', paired);
  await expectRetiredGet(
    server,
    '/companion/sync-node-versions?after_created_at=2026-04-25T00%3A00%3A00.000Z&after_change_id=desktop%230&limit=500',
    paired
  );
  await expectRetiredGet(
    server,
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
  const { createWorkspaceSyncHttpServer } = await import('./lanWorkspaceSyncServer.js');
  const server = createWorkspaceSyncHttpServer({ appVersion: '0.1.0-test', peerId: 'desktop-local' });
  const paired = await pairTestDevice(server, WORKGROUP);

  const response = await postSigned(
    server,
    '/companion/sync-objects',
    buildMobileStateObjectsBody(),
    paired
  );

  expect(response.status).toBe(410);
  expect(response.json()).toEqual({ error: 'sync_json_endpoint_retired' });
}

describe('lan workspace sync objects', () => {
  afterEach(resetTestState);

  it('requires pairing but retires legacy JSON sync GET streams', testRetiresSyncStreamsForPairedDevices);

  it('retires pushed mobile state objects from paired devices', testRetiresPushedMobileStateObjects);
});
