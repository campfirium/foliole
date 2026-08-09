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
const primaryDeviceTakeoverMock = vi.hoisted(() => ({
  handlePrimaryDeviceTakeover: vi.fn(() => ({
    ok: true,
    statusCode: 200,
    value: {
      committed_at: '2026-05-10T00:00:00.000Z',
      primary_device_epoch: 1,
      primary_device_id: 'device-android',
      release_ack: true,
      updated_by_device_id: 'device-android'
    }
  }))
}));
const syncPushMock = vi.hoisted(() => ({
  handleCompanionSyncPush: vi.fn()
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
  handleCompanionSyncPush: syncPushMock.handleCompanionSyncPush
}));
vi.mock('./companionLanPrimaryDeviceTakeover.js', () => ({
  PRIMARY_DEVICE_TAKEOVER_PATH: '/companion/primary-device/takeover',
  handlePrimaryDeviceTakeover: primaryDeviceTakeoverMock.handlePrimaryDeviceTakeover
}));

import { handleAuthenticatedPost } from './companionLanAuthenticatedPost.js';

beforeEach(() => {
  vi.resetAllMocks();
  authMock.authenticateCompanionRequest.mockReturnValue({ ok: true });
  primaryDeviceTakeoverMock.handlePrimaryDeviceTakeover.mockReturnValue({
    ok: true,
    statusCode: 200,
    value: {
      committed_at: '2026-05-10T00:00:00.000Z',
      primary_device_epoch: 1,
      primary_device_id: 'device-android',
      release_ack: true,
      updated_by_device_id: 'device-android'
    }
  });
  contentBlobMock.loadCompanionContentBlobBatch.mockReturnValue({
    body: Buffer.from('multipart-body'),
    mimeType: 'multipart/mixed; boundary=foliole-test',
    missingHashes: [],
    status: 'ready'
  });
});

it('routes signed primary device takeover requests with the authenticated device id', async () => {
  authMock.authenticateCompanionRequest.mockReturnValue({ device_id: 'device-android', ok: true } as never);
  const response = createResponse();
  const writeJson = vi.fn((_request, targetResponse, statusCode, payload) => {
    targetResponse.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    targetResponse.end(JSON.stringify(payload));
  });
  const requestBody = JSON.stringify({ candidate_device_id: 'device-android' });
  const request = Readable.from([requestBody]) as http.IncomingMessage;
  request.headers = {};
  request.method = 'POST';
  request.url = '/companion/primary-device/takeover';

  await handleAuthenticatedPost(request, response, new URL(request.url, 'http://127.0.0.1'), writeJson);

  expect(primaryDeviceTakeoverMock.handlePrimaryDeviceTakeover).toHaveBeenCalledWith(requestBody, 'device-android');
  expect(writeJson).toHaveBeenCalledWith(request, response, 200, expect.objectContaining({
    primary_device_id: 'device-android',
    release_ack: true
  }), 'POST, OPTIONS');
});

it('binds sync push provenance to the authenticated device id', async () => {
  authMock.authenticateCompanionRequest.mockReturnValue({ device_id: 'device-android', ok: true } as never);
  syncPushMock.handleCompanionSyncPush.mockResolvedValue({ acks: [] });
  const response = createResponse();
  const writeJson = createWriteJson();
  const requestBody = JSON.stringify({ items: [] });
  const request = Readable.from([requestBody]) as http.IncomingMessage;
  request.headers = {};
  request.method = 'POST';
  request.url = '/companion/sync-push';

  await handleAuthenticatedPost(request, response, new URL(request.url, 'http://127.0.0.1'), writeJson);

  expect(syncPushMock.handleCompanionSyncPush).toHaveBeenCalledWith(requestBody, 'device-android');
  expect(writeJson).toHaveBeenCalledWith(request, response, 200, { acks: [] }, 'POST, OPTIONS');
});

function createResponse() {
  const response = {
    end: vi.fn(),
    writeHead: vi.fn()
  };
  return response as unknown as http.ServerResponse & typeof response;
}

function createWriteJson() {
  return vi.fn((_request, targetResponse, statusCode, payload) => {
    targetResponse.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    targetResponse.end(JSON.stringify(payload));
  });
}

function createOversizedRequest(url: string): http.IncomingMessage & { url: string } {
  const request = Readable.from([Buffer.alloc((1024 * 1024) + 1)]) as http.IncomingMessage;
  request.headers = {};
  request.method = 'POST';
  request.url = url;
  return request as http.IncomingMessage & { url: string };
}

it('returns unknown post paths before reading oversized bodies', async () => {
  const response = createResponse();
  const writeJson = createWriteJson();
  const request = createOversizedRequest('/companion/unknown-post');

  await handleAuthenticatedPost(request, response, new URL(request.url, 'http://127.0.0.1'), writeJson);

  expect(writeJson).toHaveBeenCalledWith(request, response, 404, { error: 'not_found' }, 'POST, OPTIONS');
  expect(authMock.authenticateCompanionRequest).not.toHaveBeenCalled();
  expect(contentBlobMock.loadCompanionContentBlobBatch).not.toHaveBeenCalled();
  expect(primaryDeviceTakeoverMock.handlePrimaryDeviceTakeover).not.toHaveBeenCalled();
  expect(syncPushMock.handleCompanionSyncPush).not.toHaveBeenCalled();
});

it('returns controlled json for oversized known post bodies before auth', async () => {
  const response = createResponse();
  const writeJson = createWriteJson();
  const request = createOversizedRequest('/companion/content-blobs');

  await handleAuthenticatedPost(request, response, new URL(request.url, 'http://127.0.0.1'), writeJson);

  expect(writeJson).toHaveBeenCalledWith(request, response, 413, { error: 'request_too_large' }, 'POST, OPTIONS');
  expect(authMock.authenticateCompanionRequest).not.toHaveBeenCalled();
  expect(contentBlobMock.loadCompanionContentBlobBatch).not.toHaveBeenCalled();
});

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
