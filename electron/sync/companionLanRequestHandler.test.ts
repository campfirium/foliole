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
const attachmentResourceMock = vi.hoisted(() => ({
  loadCompanionAttachmentResource: vi.fn(async (): Promise<unknown> => ({
    body: Buffer.from('attachment-bytes'),
    mimeType: 'image/png',
    status: 'ready'
  }))
}));
const contentBlobResourceMock = vi.hoisted(() => ({
  acknowledgeCompanionContentBlobs: vi.fn((): unknown => ({
    acked_hashes: ['a'.repeat(64)],
    status: 'ok'
  })),
  loadCompanionContentBlobResource: vi.fn(async (): Promise<unknown> => ({
    body: Buffer.from('body-bytes'),
    mimeType: 'text/plain',
    status: 'ready'
  }))
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

vi.mock('../database/workspaceSnapshot.js', () => ({
  loadWorkspaceSnapshot: workspaceSnapshotMock.loadWorkspaceSnapshot,
  loadWorkspaceVersionMetadata: workspaceSnapshotMock.loadWorkspaceVersionMetadata
}));

vi.mock('./companionRequestAuth.js', () => ({
  authenticateCompanionRequest: vi.fn(() => ({ ok: true }))
}));
vi.mock('./companionLanAttachmentResources.js', () => ({
  ATTACHMENT_RESOURCE_PATH: '/companion/attachment-resource',
  loadCompanionAttachmentResource: attachmentResourceMock.loadCompanionAttachmentResource
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

import {
  ATTACHMENT_RESOURCE_PATH,
  CONTENT_BLOB_ACK_PATH,
  CONTENT_BLOB_RESOURCE_PATH,
  createLanWorkspaceSyncRequestHandler,
  SYNC_INDEX_PATH,
  SYNC_DIAGNOSTICS_PATH,
  SYNC_NODE_VERSIONS_PATH,
  SYNC_OBJECTS_PATH,
  SYNC_PACK_PATH,
  SYNC_REVIEW_LOG_PATH,
  SYNC_STATE_PATH,
  WORKSPACE_VERSION_PATH,
  WORKSPACE_SNAPSHOT_PATH
} from './companionLanRequestHandler.js';

beforeEach(() => {
  vi.resetAllMocks();
  attachmentResourceMock.loadCompanionAttachmentResource.mockResolvedValue({
    body: Buffer.from('attachment-bytes'),
    mimeType: 'image/png',
    status: 'ready'
  });
  contentBlobResourceMock.loadCompanionContentBlobResource.mockResolvedValue({
    body: Buffer.from('body-bytes'),
    mimeType: 'text/plain',
    status: 'ready'
  });
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

function createHandler() {
  return createLanWorkspaceSyncRequestHandler({
    appVersion: '0.1.0-test',
    onPairRequestCreated: null,
    peerId: 'desktop-local',
    updatePairingStatus: vi.fn(),
    getSyncStatus: () => ({
      advertised_urls: ['http://127.0.0.1:38641'],
      last_error: null,
      paired_device_count: 1,
      pending_pair_request_count: 0,
      port: 38641,
      state: 'running'
    })
  });
}

it('does not load the full workspace snapshot for unknown authenticated GET paths', async () => {
  const response = createResponse();
  await createHandler()({ headers: {}, method: 'GET', url: '/missing' } as http.IncomingMessage, response);

  expect(response.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
  expect(workspaceSnapshotMock.loadWorkspaceSnapshot).not.toHaveBeenCalled();
});

it('loads the workspace snapshot only for the snapshot endpoint', async () => {
  const response = createResponse();
  await createHandler()({ headers: {}, method: 'GET', url: WORKSPACE_SNAPSHOT_PATH } as http.IncomingMessage, response);

  expect(response.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
  expect(workspaceSnapshotMock.loadWorkspaceSnapshot).toHaveBeenCalledTimes(1);
});

it('loads lightweight version metadata for the version endpoint', async () => {
  const response = createResponse();
  await createHandler()({ headers: {}, method: 'GET', url: WORKSPACE_VERSION_PATH } as http.IncomingMessage, response);

  expect(response.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
  expect(workspaceSnapshotMock.loadWorkspaceVersionMetadata).toHaveBeenCalledTimes(1);
  expect(workspaceSnapshotMock.loadWorkspaceSnapshot).not.toHaveBeenCalled();
});

it('serves signed attachment resources without loading the workspace snapshot', async () => {
  const response = createResponse();
  await createHandler()({
    headers: {},
    method: 'GET',
    url: `${ATTACHMENT_RESOURCE_PATH}?attachment_id=att-1&content_hash=hash-1`
  } as http.IncomingMessage, response);

  expect(response.writeHead).toHaveBeenCalledWith(200, {
    'Content-Length': Buffer.byteLength('attachment-bytes'),
    'Content-Type': 'image/png'
  });
  expect(response.end).toHaveBeenCalledWith(Buffer.from('attachment-bytes'));
  expect(attachmentResourceMock.loadCompanionAttachmentResource).toHaveBeenCalledWith('att-1', 'hash-1');
  expect(workspaceSnapshotMock.loadWorkspaceSnapshot).not.toHaveBeenCalled();
});

it('returns attachment resource errors as json', async () => {
  attachmentResourceMock.loadCompanionAttachmentResource.mockResolvedValue({
    error: 'content_hash_mismatch',
    status: 'error',
    statusCode: 409
  });
  const response = createResponse();
  await createHandler()({
    headers: {},
    method: 'GET',
    url: `${ATTACHMENT_RESOURCE_PATH}?attachment_id=att-1&content_hash=wrong`
  } as http.IncomingMessage, response);

  expect(response.writeHead).toHaveBeenCalledWith(409, expect.objectContaining({
    'Content-Type': 'application/json; charset=utf-8'
  }));
  expect(response.end).toHaveBeenCalledWith(JSON.stringify({ error: 'content_hash_mismatch' }));
});

it('serves signed content body blobs without loading the workspace snapshot', async () => {
  const response = createResponse();
  await createHandler()({
    headers: {},
    method: 'GET',
    url: `${CONTENT_BLOB_RESOURCE_PATH}?hash=abc`
  } as http.IncomingMessage, response);

  expect(response.writeHead).toHaveBeenCalledWith(200, {
    'Content-Length': Buffer.byteLength('body-bytes'),
    'Content-Type': 'text/plain'
  });
  expect(response.end).toHaveBeenCalledWith(Buffer.from('body-bytes'));
  expect(contentBlobResourceMock.loadCompanionContentBlobResource).toHaveBeenCalledWith('abc');
  expect(workspaceSnapshotMock.loadWorkspaceSnapshot).not.toHaveBeenCalled();
});

it('accepts signed content body blob ack without loading the workspace snapshot', async () => {
  const response = createResponse();
  const requestBody = JSON.stringify({ hashes: ['a'.repeat(64)] });
  const request = Readable.from([requestBody]) as http.IncomingMessage;
  request.headers = {};
  request.method = 'POST';
  request.url = CONTENT_BLOB_ACK_PATH;

  await createHandler()(request, response);

  expect(response.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
    'Content-Type': 'application/json; charset=utf-8'
  }));
  expect(response.end).toHaveBeenCalledWith(JSON.stringify({
    acked_hashes: ['a'.repeat(64)],
    status: 'ok'
  }));
  expect(contentBlobResourceMock.acknowledgeCompanionContentBlobs).toHaveBeenCalledWith(requestBody);
  expect(workspaceSnapshotMock.loadWorkspaceSnapshot).not.toHaveBeenCalled();
});

it('serves signed sync pack containers without loading the workspace snapshot', async () => {
  const response = createResponse();
  await createHandler()({
    headers: {},
    method: 'GET',
    url: `${SYNC_PACK_PATH}?after_state_seq=4`
  } as http.IncomingMessage, response);

  expect(response.writeHead).toHaveBeenCalledWith(200, {
    'Content-Disposition': 'attachment; filename="pack-1.syncpack"',
    'Content-Length': Buffer.byteLength('sqlite-pack'),
    'Content-Type': 'application/zip'
  });
  expect(response.end).toHaveBeenCalledWith(Buffer.from('sqlite-pack'));
  expect(syncPackMock.buildCompanionSyncPackResource).toHaveBeenCalledWith(expect.objectContaining({
    pathname: SYNC_PACK_PATH
  }));
  expect(workspaceSnapshotMock.loadWorkspaceSnapshot).not.toHaveBeenCalled();
});

it('serves signed sync diagnostics without loading content bodies or the workspace snapshot', async () => {
  const response = createResponse();
  await createHandler()({
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
  await createHandler()({
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

  await createHandler()(request, response);

  expect(response.writeHead).toHaveBeenCalledWith(410, expect.objectContaining({
    'Content-Type': 'application/json; charset=utf-8'
  }));
  expect(response.end).toHaveBeenCalledWith(JSON.stringify({ error: 'sync_json_endpoint_retired' }));
  expect(workspaceSnapshotMock.loadWorkspaceSnapshot).not.toHaveBeenCalled();
});
