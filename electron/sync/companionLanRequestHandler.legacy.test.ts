import type http from 'node:http';
import { Readable } from 'node:stream';

import { beforeEach, expect, it, vi } from 'vitest';

const workspaceSnapshotMock = vi.hoisted(() => ({
  loadWorkspaceSnapshot: vi.fn(() => null),
  loadWorkspaceVersionMetadata: vi.fn(() => ({
    hasSnapshot: true,
    workspaceVersion: '2026-04-26T00:00:00.000Z'
  }))
}));
const contentBlobResourceMock = vi.hoisted(() => ({
  acknowledgeCompanionContentBlobs: vi.fn((): unknown => ({
    acked_hashes: ['a'.repeat(64)],
    status: 'ok'
  })),
  loadCompanionContentBlobResource: vi.fn()
}));
const syncPackMock = vi.hoisted(() => ({
  buildCompanionSyncPackResource: vi.fn(async (): Promise<unknown> => ({
    body: Buffer.from('sqlite-pack'),
    fileName: 'pack-1.syncpack',
    status: 'ready',
    statusCode: 200
  }))
}));
const diagnosticsMock = vi.hoisted(() => ({
  buildCompanionSyncDiagnostics: vi.fn((): unknown => ({
    collected_at: '2026-04-29T00:00:00.000Z',
    content: { missing_content_blob_count: 0 },
    events: [],
    host: 'desktop',
    identity: { app_version: '0.1.0-test', database_path: null, device_id: 'desktop-local' },
    storage: { active_node_count: 1 },
    sync_state: { max_state_seq: 4 },
    verdicts: []
  }))
}));
const workgroupKeyMock = vi.hoisted(() => ({
  group_id: 'group-1',
  group_key: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
  group_tag: '630dcd2966c4336691125448bbb25b4f'
}));

vi.mock('../database/workspaceSnapshot.js', () => ({
  loadWorkspaceSnapshot: workspaceSnapshotMock.loadWorkspaceSnapshot,
  loadWorkspaceVersionMetadata: workspaceSnapshotMock.loadWorkspaceVersionMetadata
}));
vi.mock('./companionRequestAuth.js', () => ({
  authenticateCompanionRequest: vi.fn(() => ({ device_id: 'android-fixture', ok: true }))
}));
vi.mock('./companionLanContentBlobs.js', () => ({
  CONTENT_BLOB_ACK_PATH: '/companion/content-blob/ack',
  CONTENT_BLOB_BATCH_PATH: '/companion/content-blobs',
  CONTENT_BLOB_RESOURCE_PATH: '/companion/content-blob',
  acknowledgeCompanionContentBlobs: contentBlobResourceMock.acknowledgeCompanionContentBlobs,
  loadCompanionContentBlobResource: contentBlobResourceMock.loadCompanionContentBlobResource
}));
vi.mock('./companionLanSyncPack.js', () => ({
  SYNC_PACK_PATH: '/companion/sync-pack',
  buildCompanionSyncPackResource: syncPackMock.buildCompanionSyncPackResource
}));
vi.mock('./buildCompanionSyncDiagnostics.js', () => ({
  buildCompanionSyncDiagnostics: diagnosticsMock.buildCompanionSyncDiagnostics
}));
vi.mock('./workgroupKeyStore.js', () => ({
  consumeDesktopWorkgroupNonce: vi.fn(() => true),
  loadDesktopWorkgroupKey: vi.fn(() => workgroupKeyMock)
}));

import {
  CONTENT_BLOB_ACK_PATH,
  SYNC_DIAGNOSTICS_PATH,
  SYNC_INDEX_PATH,
  SYNC_NODE_VERSIONS_PATH,
  SYNC_OBJECTS_PATH,
  SYNC_PACK_PATH,
  SYNC_REVIEW_LOG_PATH,
  SYNC_STATE_PATH
} from './companionLanRequestHandler.js';
import { createLegacyLanWorkspaceSyncHandler } from './companionLanRequestHandler.legacy.testSupport.js';
import { WORKGROUP_ENVELOPE_CONTENT_TYPE } from './workgroupHttpCrypto.js';
import { decryptWorkgroupResponse, encryptJsonWorkgroupRequest } from './workgroupHttpCrypto.testSupport.js';

beforeEach(() => {
  vi.resetAllMocks();
  contentBlobResourceMock.acknowledgeCompanionContentBlobs.mockReturnValue({
    acked_hashes: ['a'.repeat(64)],
    status: 'ok'
  });
  syncPackMock.buildCompanionSyncPackResource.mockResolvedValue({
    body: Buffer.from('sqlite-pack'),
    fileName: 'pack-1.syncpack',
    status: 'ready',
    statusCode: 200
  });
  diagnosticsMock.buildCompanionSyncDiagnostics.mockReturnValue({
    collected_at: '2026-04-29T00:00:00.000Z',
    content: { missing_content_blob_count: 0 },
    events: [],
    host: 'desktop',
    identity: { app_version: '0.1.0-test', database_path: null, device_id: 'desktop-local' },
    storage: { active_node_count: 1 },
    sync_state: { max_state_seq: 4 },
    verdicts: []
  });
});

function createResponse() {
  const response = {
    end: vi.fn(),
    writeHead: vi.fn()
  };
  return response as unknown as http.ServerResponse & typeof response;
}

it('accepts signed content body blob ack without loading the workspace snapshot', async () => {
  const response = createResponse();
  const requestBody = JSON.stringify({ hashes: ['a'.repeat(64)] });
  const encryptedBody = encryptJsonWorkgroupRequest({
    body: requestBody, groupId: 'group-1', method: 'POST', pathWithQuery: CONTENT_BLOB_ACK_PATH
  });
  const request = Readable.from([encryptedBody]) as http.IncomingMessage;
  request.headers = { 'x-sync-group-id': 'group-1' };
  request.method = 'POST';
  request.url = CONTENT_BLOB_ACK_PATH;

  await createLegacyLanWorkspaceSyncHandler()(request, response);

  expect(response.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
    'Content-Type': WORKGROUP_ENVELOPE_CONTENT_TYPE,
    'X-Foliole-Original-Content-Type': 'application/json; charset=utf-8'
  }));
  const responseBody = response.end.mock.calls[0]?.[0] as Buffer;
  expect(JSON.parse(decryptWorkgroupResponse({
    body: responseBody, contentType: 'application/json; charset=utf-8', groupId: 'group-1',
    method: 'POST', pathWithQuery: CONTENT_BLOB_ACK_PATH
  }).toString('utf8'))).toEqual({
    acked_hashes: ['a'.repeat(64)],
    status: 'ok'
  });
  expect(contentBlobResourceMock.acknowledgeCompanionContentBlobs).toHaveBeenCalledWith(requestBody);
  expect(workspaceSnapshotMock.loadWorkspaceSnapshot).not.toHaveBeenCalled();
});

it('serves signed sync pack containers without loading the workspace snapshot', async () => {
  const response = createResponse();
  await createLegacyLanWorkspaceSyncHandler()({
    headers: { 'x-sync-group-id': 'group-1' },
    method: 'GET',
    url: `${SYNC_PACK_PATH}?after_state_seq=4`
  } as http.IncomingMessage, response);

  expect(response.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
    'Content-Type': WORKGROUP_ENVELOPE_CONTENT_TYPE,
    'X-Foliole-Original-Content-Type': 'application/zip'
  }));
  const responseBody = response.end.mock.calls[0]?.[0] as Buffer;
  expect(decryptWorkgroupResponse({
    body: responseBody, contentType: 'application/zip', groupId: 'group-1', method: 'GET',
    pathWithQuery: `${SYNC_PACK_PATH}?after_state_seq=4`
  })).toEqual(Buffer.from('sqlite-pack'));
  expect(syncPackMock.buildCompanionSyncPackResource).toHaveBeenCalledWith(expect.objectContaining({
    pathname: SYNC_PACK_PATH
  }), 'android-fixture');
  expect(workspaceSnapshotMock.loadWorkspaceSnapshot).not.toHaveBeenCalled();
});

it('serves signed sync diagnostics without loading content bodies or the workspace snapshot', async () => {
  const response = createResponse();
  await createLegacyLanWorkspaceSyncHandler()({
    headers: {},
    method: 'GET',
    url: SYNC_DIAGNOSTICS_PATH
  } as http.IncomingMessage, response);

  expect(response.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
    'Content-Type': 'application/json; charset=utf-8'
  }));
  expect(response.end).toHaveBeenCalledWith(expect.stringContaining('"host":"desktop"'));
  expect(response.end).not.toHaveBeenCalledWith(expect.stringContaining('"content":"'));
  expect(diagnosticsMock.buildCompanionSyncDiagnostics).toHaveBeenCalledWith(expect.objectContaining({
    appVersion: '0.1.0-test',
    serverStatus: expect.objectContaining({ state: 'running' })
  }));
  expect(workspaceSnapshotMock.loadWorkspaceSnapshot).not.toHaveBeenCalled();
});

it.each([
  SYNC_INDEX_PATH,
  `${SYNC_NODE_VERSIONS_PATH}?after_created_at=2026-04-25T00%3A00%3A00.000Z&after_change_id=desktop%230`,
  `${SYNC_OBJECTS_PATH}?object_type=setting&object_id=setting%3Atheme`,
  `${SYNC_REVIEW_LOG_PATH}?after_created_at=2026-04-25T00%3A00%3A00.000Z&after_change_id=op-0`,
  `${SYNC_STATE_PATH}?after_state_seq=0`
])('retires signed legacy JSON GET endpoint %s', async (pathWithQuery) => {
  const response = createResponse();
  await createLegacyLanWorkspaceSyncHandler()({
    headers: {},
    method: 'GET',
    url: pathWithQuery
  } as http.IncomingMessage, response);

  expect(response.writeHead).toHaveBeenCalledWith(410, expect.objectContaining({
    'Content-Type': 'application/json; charset=utf-8'
  }));
  expect(response.end).toHaveBeenCalledWith(JSON.stringify({ error: 'sync_json_endpoint_retired' }));
  expect(workspaceSnapshotMock.loadWorkspaceSnapshot).not.toHaveBeenCalled();
});

it.each([
  SYNC_NODE_VERSIONS_PATH,
  SYNC_OBJECTS_PATH,
  SYNC_REVIEW_LOG_PATH
])('retires signed legacy JSON POST endpoint %s', async (path) => {
  const response = createResponse();
  const request = Readable.from([JSON.stringify({ objects: [] })]) as http.IncomingMessage;
  request.headers = {};
  request.method = 'POST';
  request.url = path;

  await createLegacyLanWorkspaceSyncHandler()(request, response);

  expect(response.writeHead).toHaveBeenCalledWith(410, expect.objectContaining({
    'Content-Type': 'application/json; charset=utf-8'
  }));
  expect(response.end).toHaveBeenCalledWith(JSON.stringify({ error: 'sync_json_endpoint_retired' }));
  expect(workspaceSnapshotMock.loadWorkspaceSnapshot).not.toHaveBeenCalled();
});
