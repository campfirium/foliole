import type http from 'node:http';

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

import {
  ATTACHMENT_RESOURCE_PATH,
  createLanWorkspaceSyncRequestHandler,
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
    updatePairingStatus: vi.fn()
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
