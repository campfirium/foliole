import type http from 'node:http';

import { beforeEach, expect, it, vi } from 'vitest';

const workspaceSnapshotMock = vi.hoisted(() => ({
  loadWorkspaceSnapshot: vi.fn(() => null),
  loadWorkspaceVersionMetadata: vi.fn(() => ({
    hasSnapshot: true,
    workspaceVersion: '2026-04-26T00:00:00.000Z'
  }))
}));

vi.mock('../database/workspaceSnapshot.js', () => ({
  loadWorkspaceSnapshot: workspaceSnapshotMock.loadWorkspaceSnapshot,
  loadWorkspaceVersionMetadata: workspaceSnapshotMock.loadWorkspaceVersionMetadata
}));

vi.mock('./companionRequestAuth.js', () => ({
  authenticateCompanionRequest: vi.fn(() => ({ ok: true }))
}));

import {
  createLanWorkspaceSyncRequestHandler,
  WORKSPACE_VERSION_PATH,
  WORKSPACE_SNAPSHOT_PATH
} from './companionLanRequestHandler.js';

beforeEach(() => {
  vi.resetAllMocks();
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
