import type http from 'node:http';
import { PassThrough, Writable } from 'node:stream';

import { expect, it, vi } from 'vitest';

const attachmentMock = vi.hoisted(() => ({ load: vi.fn() }));
const workspaceMock = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock('../database/connection.js', () => ({
  registerDatabaseConnectionCleanup: vi.fn(),
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => execute()
}));
vi.mock('../database/workspaceSnapshot.js', () => ({
  loadWorkspaceSnapshot: workspaceMock.load, loadWorkspaceVersionMetadata: vi.fn()
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

function responseFixture() {
  const response = new Writable({
    write(_chunk, _encoding, done) { done(); }
  }) as unknown as http.ServerResponse;
  response.writeHead = vi.fn() as never;
  return response;
}

it('retires the legacy attachment GET before loading resources or a workspace snapshot', async () => {
  const response = responseFixture();
  const handler = createLanWorkspaceSyncRequestHandler({
    appVersion: '0.1.0-test', deviceId: 'desktop-local', getSyncStatus: () => null,
    onJoinRequestCreated: null, updateGroupStatus: vi.fn()
  });
  await handler({ headers: {}, method: 'GET',
    url: `${ATTACHMENT_RESOURCE_PATH}?attachment_id=att-1&content_hash=hash-1`
  } as http.IncomingMessage, response);

  expect(response.writeHead).toHaveBeenCalledWith(410, expect.objectContaining({
    'Content-Type': 'application/json; charset=utf-8'
  }));
  expect(attachmentMock.load).not.toHaveBeenCalled();
  expect(workspaceMock.load).not.toHaveBeenCalled();
});
