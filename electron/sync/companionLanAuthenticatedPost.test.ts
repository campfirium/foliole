import type http from 'node:http';
import { Readable } from 'node:stream';

import { beforeEach, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  authenticateCompanionRequest: vi.fn(() => ({ ok: true }))
}));
const contentBlobMock = vi.hoisted(() => ({
  loadCompanionContentBlobBatch: vi.fn(() => ({
    body: Buffer.from('multipart-body'),
    mimeType: 'multipart/mixed; boundary=foliole-test',
    missingHashes: [],
    status: 'ready'
  }))
}));

vi.mock('./companionRequestAuth.js', () => ({
  authenticateCompanionRequest: authMock.authenticateCompanionRequest
}));
vi.mock('./companionLanContentBlobs.js', () => ({
  CONTENT_BLOB_ACK_PATH: '/companion/content-blob/ack',
  CONTENT_BLOB_BATCH_PATH: '/companion/content-blobs',
  acknowledgeCompanionContentBlobs: vi.fn(),
  loadCompanionContentBlobBatch: contentBlobMock.loadCompanionContentBlobBatch
}));
vi.mock('./companionLanSyncObjects.js', () => ({
  isRetiredSyncJsonEndpoint: vi.fn(() => false)
}));
vi.mock('./companionLanSyncPush.js', () => ({
  SYNC_PUSH_PATH: '/companion/sync-push',
  handleCompanionSyncPush: vi.fn()
}));

import { handleAuthenticatedPost } from './companionLanAuthenticatedPost.js';

beforeEach(() => {
  vi.resetAllMocks();
  authMock.authenticateCompanionRequest.mockReturnValue({ ok: true });
  contentBlobMock.loadCompanionContentBlobBatch.mockReturnValue({
    body: Buffer.from('multipart-body'),
    mimeType: 'multipart/mixed; boundary=foliole-test',
    missingHashes: [],
    status: 'ready'
  });
});

function createResponse() {
  const response = {
    end: vi.fn(),
    writeHead: vi.fn()
  };
  return response as unknown as http.ServerResponse & typeof response;
}

it('serves signed content body blob batches', async () => {
  const response = createResponse();
  const writeJson = vi.fn((_request, targetResponse, statusCode, payload) => {
    targetResponse.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    targetResponse.end(JSON.stringify(payload));
  });
  const requestBody = JSON.stringify({ hashes: ['a'.repeat(64)] });
  const request = Readable.from([requestBody]) as http.IncomingMessage;
  request.headers = {};
  request.method = 'POST';
  request.url = '/companion/content-blobs';

  await handleAuthenticatedPost(request, response, new URL(request.url, 'http://127.0.0.1'), writeJson);

  expect(contentBlobMock.loadCompanionContentBlobBatch).toHaveBeenCalledWith(requestBody);
  expect(response.writeHead).toHaveBeenCalledWith(200, {
    'Content-Length': Buffer.byteLength('multipart-body'),
    'Content-Type': 'multipart/mixed; boundary=foliole-test'
  });
  expect(response.end).toHaveBeenCalledWith(Buffer.from('multipart-body'));
});
