import { promises as fs } from 'node:fs';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const workspaceSnapshotMock = vi.hoisted(() => ({
  loadWorkspaceSnapshot: vi.fn(() => null),
  loadWorkspaceVersionMetadata: vi.fn(() => ({
    hasSnapshot: true,
    workspaceVersion: '2026-04-26T00:00:00.000Z'
  }))
}));
const attachmentResourceMock = vi.hoisted(() => ({
  loadCompanionAttachmentResource: vi.fn(async (): Promise<unknown> => ({
    contentLength: 0,
    filePath: '',
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
  authenticateCompanionRequest: vi.fn(() => ({ device_id: 'android-fixture', ok: true }))
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
vi.mock('./workgroupHttpCrypto.js', () => ({
  createWorkgroupResponseStreamCipher: vi.fn(() => ({
    authTag: () => Buffer.alloc(0), cipher: new PassThrough(),
    prefix: Buffer.alloc(0), suffix: Buffer.alloc(0)
  })),
  encryptWorkgroupResponse: vi.fn(() => Buffer.from('encrypted-resource')),
  WORKGROUP_ENVELOPE_CONTENT_TYPE: 'application/vnd.foliole.workgroup-aead+json'
}));

import {
  ATTACHMENT_RESOURCE_PATH,
  CONTENT_BLOB_RESOURCE_PATH,
  createLanWorkspaceSyncRequestHandler,
  WORKSPACE_VERSION_PATH,
  WORKSPACE_SNAPSHOT_PATH
} from './companionLanRequestHandler.js';

let tempRoot = '';
let attachmentFilePath = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-lan-request-handler-'));
  attachmentFilePath = path.join(tempRoot, 'attachment.bin');
  await fs.writeFile(attachmentFilePath, 'attachment-bytes');
  vi.resetAllMocks();
  attachmentResourceMock.loadCompanionAttachmentResource.mockResolvedValue({
    contentLength: Buffer.byteLength('attachment-bytes'),
    filePath: attachmentFilePath,
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

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function createResponse() {
  const chunks: Buffer[] = [];
  const writable = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  });
  const originalEnd = writable.end.bind(writable);
  const response = writable as unknown as {
    body(): Buffer;
    end: ReturnType<typeof vi.fn>;
    writeHead: ReturnType<typeof vi.fn>;
  };
  response.end = vi.fn((chunk?: unknown, encoding?: unknown, callback?: unknown) => {
    if (typeof encoding === 'function') {
      return originalEnd(chunk, encoding as () => void);
    }
    if (typeof encoding === 'string') {
      return originalEnd(chunk, encoding as BufferEncoding, callback as (() => void) | undefined);
    }
    return originalEnd(chunk, callback as (() => void) | undefined);
  });
  response.writeHead = vi.fn();
  response.body = () => Buffer.concat(chunks);
  return response as unknown as http.ServerResponse & typeof response;
}

function createHandler() {
  return createLanWorkspaceSyncRequestHandler({
    appVersion: '0.1.0-test',
    onJoinRequestCreated: null,
    deviceId: 'desktop-local',
    updateGroupStatus: vi.fn(),
    getSyncStatus: () => ({
      advertised_urls: ['http://127.0.0.1:38641'],
      last_error: null,
      active_device_count: 1,
      pending_join_request_count: 0,
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
    'Content-Type': 'application/vnd.foliole.workgroup-aead+json',
    'X-Foliole-Original-Content-Type': 'image/png'
  });
  expect(response.body().toString()).toBe(Buffer.from('attachment-bytes').toString('base64url'));
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
    'Content-Length': Buffer.byteLength('encrypted-resource'),
    'Content-Type': 'application/vnd.foliole.workgroup-aead+json',
    'X-Foliole-Original-Content-Type': 'text/plain'
  });
  expect(response.end).toHaveBeenCalledWith(Buffer.from('encrypted-resource'));
  expect(contentBlobResourceMock.loadCompanionContentBlobResource).toHaveBeenCalledWith('abc');
  expect(workspaceSnapshotMock.loadWorkspaceSnapshot).not.toHaveBeenCalled();
});
