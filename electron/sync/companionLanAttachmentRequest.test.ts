import { promises as fs } from 'node:fs';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const attachmentMock = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => execute()
}));
vi.mock('../database/workspaceSnapshot.js', () => ({
  loadWorkspaceSnapshot: vi.fn(), loadWorkspaceVersionMetadata: vi.fn()
}));
vi.mock('./companionRequestAuth.js', () => ({
  authenticateCompanionRequest: vi.fn(() => ({ device_id: 'android-fixture', ok: true }))
}));
vi.mock('./companionLanAttachmentResources.js', () => ({
  ATTACHMENT_RESOURCE_PATH: '/companion/attachment-resource',
  loadCompanionAttachmentResource: attachmentMock.load
}));
vi.mock('./companionLanContentBlobs.js', () => ({
  CONTENT_BLOB_ACK_PATH: '/companion/content-blob/ack',
  CONTENT_BLOB_RESOURCE_PATH: '/companion/content-blob'
}));
vi.mock('./companionLanSyncPack.js', () => ({ SYNC_PACK_PATH: '/companion/sync-pack' }));
vi.mock('./buildCompanionSyncDiagnostics.js', () => ({ buildCompanionSyncDiagnostics: vi.fn() }));
vi.mock('./workgroupHttpCrypto.js', () => ({
  createWorkgroupResponseStreamCipher: vi.fn(() => ({
    authTag: () => Buffer.alloc(0), cipher: new PassThrough(),
    prefix: Buffer.alloc(0), suffix: Buffer.alloc(0)
  })),
  encryptWorkgroupResponse: vi.fn(() => Buffer.from('encrypted-resource')),
  WORKGROUP_ENVELOPE_CONTENT_TYPE: 'application/vnd.foliole.workgroup-aead+json'
}));

import {
  ATTACHMENT_RESOURCE_PATH, createLanWorkspaceSyncRequestHandler
} from './companionLanRequestHandler.js';

let tempRoot = '';
let attachmentPath = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-lan-attachment-'));
  attachmentPath = path.join(tempRoot, 'attachment.bin');
  await fs.writeFile(attachmentPath, 'attachment-bytes');
  vi.resetAllMocks();
  attachmentMock.load.mockResolvedValue({
    contentLength: Buffer.byteLength('attachment-bytes'), filePath: attachmentPath,
    mimeType: 'image/png', status: 'ready'
  });
});

afterEach(async () => fs.rm(tempRoot, { force: true, recursive: true }));

function responseFixture() {
  const chunks: Buffer[] = [];
  const response = new Writable({
    write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); }
  }) as unknown as http.ServerResponse & { body: () => Buffer };
  response.writeHead = vi.fn() as never;
  response.body = () => Buffer.concat(chunks);
  return response;
}

function handler() {
  return createLanWorkspaceSyncRequestHandler({
    appVersion: '0.1.0-test', deviceId: 'desktop-local', getSyncStatus: () => null,
    onJoinRequestCreated: null, updateGroupStatus: vi.fn()
  });
}

it('serves signed attachment resources without loading a workspace snapshot', async () => {
  const response = responseFixture();
  await handler()({ headers: {}, method: 'GET',
    url: `${ATTACHMENT_RESOURCE_PATH}?attachment_id=att-1&content_hash=hash-1`
  } as http.IncomingMessage, response);

  expect(response.writeHead).toHaveBeenCalledWith(200, {
    'Content-Type': 'application/vnd.foliole.workgroup-aead+json',
    'X-Foliole-Original-Content-Type': 'image/png'
  });
  expect(response.body().toString()).toBe(Buffer.from('attachment-bytes').toString('base64url'));
  expect(attachmentMock.load).toHaveBeenCalledWith('att-1', 'hash-1');
});

it('returns attachment resource errors as json', async () => {
  attachmentMock.load.mockResolvedValue({
    error: 'content_hash_mismatch', status: 'error', statusCode: 409
  });
  const response = responseFixture();
  await handler()({ headers: {}, method: 'GET',
    url: `${ATTACHMENT_RESOURCE_PATH}?attachment_id=att-1&content_hash=wrong`
  } as http.IncomingMessage, response);

  expect(response.writeHead).toHaveBeenCalledWith(409, expect.objectContaining({
    'Content-Type': 'application/json; charset=utf-8'
  }));
});
