import type http from 'node:http';
import { Readable } from 'node:stream';

import { beforeEach, expect, it, vi } from 'vitest';

const databaseOwnerMock = vi.hoisted(() => ({
  active: false,
  run: vi.fn(async (execute: () => unknown) => {
    databaseOwnerMock.active = true;
    try { return await execute(); }
    finally { databaseOwnerMock.active = false; }
  })
}));

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: databaseOwnerMock.run
}));

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
const syncPushMock = vi.hoisted(() => ({
  handleCompanionSyncPush: vi.fn()
}));
const memberStateMock = vi.hoisted(() => ({
  accept: vi.fn(() => ({ localExited: false, state: { contract_version: 1 } }))
}));
const readwiseStopMock = vi.hoisted(() => ({ handle: vi.fn() }));
const readwiseSetupMock = vi.hoisted(() => ({ handle: vi.fn() }));
const workgroupHttpMock = vi.hoisted(() => ({
  decryptWorkgroupRequestBody: vi.fn((_request, body: string) => Buffer.from(body)),
  writeWorkgroupBinary: vi.fn()
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
vi.mock('./desktopSyncGroupMemberState.js', () => ({
  SYNC_GROUP_MEMBER_STATE_PATH: '/sync-group/member-state',
  acceptDesktopSyncGroupMemberState: memberStateMock.accept
}));
vi.mock('./desktopSyncGroupOverviewNotifier.js', () => ({
  notifyDesktopSyncGroupOverviewChanged: vi.fn()
}));
vi.mock('./readwiseOwnerStop.js', () => ({
  READWISE_OWNER_STOP_PATH: '/companion/readwise-owner-stop',
  handleReadwiseOwnerStop: readwiseStopMock.handle
}));
vi.mock('./readwiseGroupSetup.js', () => ({
  READWISE_GROUP_SETUP_PATH: '/companion/readwise-group-setup',
  handleReadwiseGroupSetup: readwiseSetupMock.handle
}));
vi.mock('./companionLanResponses.js', () => ({
  writeWorkgroupBinary: workgroupHttpMock.writeWorkgroupBinary
}));
vi.mock('./workgroupHttpCrypto.js', () => ({
  decryptWorkgroupRequestBody: workgroupHttpMock.decryptWorkgroupRequestBody
}));

import { handleAuthenticatedPost } from './companionLanAuthenticatedPost.js';

beforeEach(() => {
  vi.resetAllMocks();
  databaseOwnerMock.active = false;
  authMock.authenticateCompanionRequest.mockReturnValue({ ok: true });
  contentBlobMock.loadCompanionContentBlobBatch.mockReturnValue({
    body: Buffer.from('multipart-body'),
    mimeType: 'multipart/mixed; boundary=foliole-test',
    missingHashes: [],
    status: 'ready'
  });
  workgroupHttpMock.decryptWorkgroupRequestBody.mockImplementation(
    (_request, body: string) => Buffer.from(body)
  );
});

it('binds sync push provenance to the authenticated Host', async () => {
  authMock.authenticateCompanionRequest.mockImplementation(() => {
    expect(databaseOwnerMock.active).toBe(true);
    return { device_id: 'device-android', device_name: 'Android A5', ok: true } as never;
  });
  syncPushMock.handleCompanionSyncPush.mockResolvedValue({ acks: [] });
  const response = createResponse();
  const writeJson = createWriteJson();
  const requestBody = JSON.stringify({ items: [] });
  const request = Readable.from([requestBody]) as http.IncomingMessage;
  request.headers = {};
  request.method = 'POST';
  request.url = '/companion/sync-push';

  await handleAuthenticatedPost(request, response, new URL(request.url, 'http://127.0.0.1'), writeJson);

  expect(syncPushMock.handleCompanionSyncPush).toHaveBeenCalledWith(requestBody, 'Android A5');
  expect(writeJson).toHaveBeenCalledWith(request, response, 200, { acks: [] }, 'POST, OPTIONS');
});

it('routes Readwise stop only after member authentication and decryption', async () => {
  authMock.authenticateCompanionRequest.mockReturnValue({
    device_id: 'candidate', device_name: 'Candidate', ok: true
  } as never);
  readwiseStopMock.handle.mockReturnValue({ status: 'stopped', requestId: 'request-one' });
  const response = createResponse();
  const writeJson = createWriteJson();
  const requestBody = JSON.stringify({ requestId: 'request-one' });
  const request = Readable.from([requestBody]) as http.IncomingMessage;
  request.headers = {};
  request.method = 'POST';
  request.url = '/companion/readwise-owner-stop';
  await handleAuthenticatedPost(request, response, new URL(request.url, 'http://127.0.0.1'), writeJson);
  expect(authMock.authenticateCompanionRequest).toHaveBeenCalledWith({
    allowUnknownDevice: false, bodyText: requestBody, request, requireMemberState: true
  });
  expect(workgroupHttpMock.decryptWorkgroupRequestBody).toHaveBeenCalledWith(request, requestBody);
  expect(readwiseStopMock.handle).toHaveBeenCalledWith(requestBody, 'candidate');
  expect(writeJson).toHaveBeenCalledWith(request, response, 200,
    { status: 'stopped', requestId: 'request-one' }, 'POST, OPTIONS');
});

it('routes Readwise setup through member authentication and encrypted body', async () => {
  authMock.authenticateCompanionRequest.mockReturnValue({
    device_id: 'candidate', device_name: 'Candidate', ok: true
  } as never);
  readwiseSetupMock.handle.mockResolvedValue({ deviceId: 'local', mode: 'api' });
  const response = createResponse();
  const writeJson = createWriteJson();
  const requestBody = JSON.stringify({ action: 'inspect' });
  const request = Readable.from([requestBody]) as http.IncomingMessage;
  request.headers = {}; request.method = 'POST'; request.url = '/companion/readwise-group-setup';
  await handleAuthenticatedPost(request, response, new URL(request.url, 'http://127.0.0.1'), writeJson);
  expect(authMock.authenticateCompanionRequest).toHaveBeenCalledWith({
    allowUnknownDevice: false, bodyText: requestBody, request, requireMemberState: true
  });
  expect(readwiseSetupMock.handle).toHaveBeenCalledWith(requestBody, 'candidate');
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
  expect(workgroupHttpMock.writeWorkgroupBinary).toHaveBeenCalledWith(
    request, response, 200, Buffer.from('multipart-body'), 'multipart/mixed; boundary=foliole-test'
  );
});

it('allows an unknown key holder to exchange member state before data sync', async () => {
  authMock.authenticateCompanionRequest.mockReturnValue({
    device_id: 'device-new', device_name: 'device-new', ok: true
  } as never);
  const response = createResponse();
  const writeJson = createWriteJson();
  const requestBody = JSON.stringify({ contract_version: 1 });
  const request = Readable.from([requestBody]) as http.IncomingMessage;
  request.headers = {};
  request.method = 'POST';
  request.url = '/sync-group/member-state';

  await handleAuthenticatedPost(request, response, new URL(request.url, 'http://127.0.0.1'), writeJson);

  expect(authMock.authenticateCompanionRequest).toHaveBeenCalledWith({
    allowUnknownDevice: true, bodyText: requestBody, request, requireMemberState: false
  });
  expect(memberStateMock.accept).toHaveBeenCalledWith(requestBody, 'device-new');
  expect(writeJson).toHaveBeenCalledWith(
    request, response, 200, { contract_version: 1 }, 'POST, OPTIONS'
  );
});
