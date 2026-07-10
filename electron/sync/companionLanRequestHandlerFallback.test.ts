import type http from 'node:http';

import { beforeEach, expect, it, vi } from 'vitest';

const authenticatedPostMock = vi.hoisted(() => ({
  handleAuthenticatedPost: vi.fn()
}));

vi.mock('../database/workspaceSnapshot.js', () => ({
  loadWorkspaceSnapshot: vi.fn(() => null),
  loadWorkspaceVersionMetadata: vi.fn(() => ({
    hasSnapshot: true,
    workspaceVersion: '2026-04-26T00:00:00.000Z'
  }))
}));
vi.mock('./companionLanAuthenticatedPost.js', () => ({
  handleAuthenticatedPost: authenticatedPostMock.handleAuthenticatedPost
}));
vi.mock('./companionLanAttachmentResources.js', () => ({
  ATTACHMENT_RESOURCE_PATH: '/companion/attachment-resource',
  loadCompanionAttachmentResource: vi.fn()
}));
vi.mock('./companionLanContentBlobs.js', () => ({
  CONTENT_BLOB_ACK_PATH: '/companion/content-blob/ack',
  CONTENT_BLOB_RESOURCE_PATH: '/companion/content-blob',
  loadCompanionContentBlobResource: vi.fn()
}));
vi.mock('./companionLanSyncPackGet.js', () => ({
  handleSyncPackGet: vi.fn(async () => false)
}));
vi.mock('./buildCompanionSyncDiagnostics.js', () => ({
  buildCompanionSyncDiagnostics: vi.fn()
}));
vi.mock('./companionRequestAuth.js', () => ({
  authenticateCompanionRequest: vi.fn(() => ({ ok: true }))
}));

import { createLanWorkspaceSyncRequestHandler } from './companionLanRequestHandler.js';

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

function createResponse() {
  const response = {
    end: vi.fn(() => {
      response.writableEnded = true;
    }),
    writableEnded: false,
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

it('ends unhandled route errors with a generic json response', async () => {
  authenticatedPostMock.handleAuthenticatedPost.mockRejectedValue(new Error('route failed'));
  const response = createResponse();

  await createHandler()({ headers: {}, method: 'POST', url: '/companion/content-blobs' } as http.IncomingMessage, response);

  expect(response.writeHead).toHaveBeenCalledWith(500, expect.objectContaining({
    'Content-Type': 'application/json; charset=utf-8'
  }));
  expect(response.end).toHaveBeenCalledWith(JSON.stringify({ error: 'internal_server_error' }));
});

it('does not write a fallback response after the route already ended the response', async () => {
  authenticatedPostMock.handleAuthenticatedPost.mockImplementation(async (_request, response: http.ServerResponse) => {
    response.writeHead(204, {});
    response.end();
    throw new Error('route failed after end');
  });
  const response = createResponse();

  await createHandler()({ headers: {}, method: 'POST', url: '/companion/content-blobs' } as http.IncomingMessage, response);

  expect(response.writeHead).toHaveBeenCalledTimes(1);
  expect(response.writeHead).toHaveBeenCalledWith(204, {});
  expect(response.end).toHaveBeenCalledTimes(1);
});
