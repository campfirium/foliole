// @vitest-environment node
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleMaterialRoute: vi.fn(),
  handleVirtualFolderRoute: vi.fn(),
  runWithDatabaseConnectionOwner: vi.fn((execute: () => unknown) => execute())
}));

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: mocks.runWithDatabaseConnectionOwner
}));
vi.mock('./agentControlRouteDispatch.js', () => ({
  handleAgentControlMaterialRoute: mocks.handleMaterialRoute,
  handleAgentControlVirtualFolderRoute: mocks.handleVirtualFolderRoute
}));

import { createAgentControlRequestHandler } from './agentControlRequestHandler.js';

let server: http.Server | null = null;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
  server = null;
});

it('queues product routes behind the active database owner', async () => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  mocks.runWithDatabaseConnectionOwner.mockImplementationOnce(async (execute: () => unknown) => {
    await waiting;
    return execute();
  });
  mocks.handleMaterialRoute.mockImplementation(async (_request, response: http.ServerResponse) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"material":{"id":"node-1"}}');
    return true;
  });

  server = http.createServer(createAgentControlRequestHandler({
    appVersion: 'test',
    auditSink: vi.fn(),
    runtimeIdentity: { boot_id: 'boot', database_device_id_hash: null, pid: 1, started_at: 'now' },
    token: 'token'
  }));
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const response = fetch(`http://127.0.0.1:${port}/agent-control/v1/materials/read`, {
    body: '{"id":"node-1"}',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    method: 'POST'
  });

  await vi.waitFor(() => expect(mocks.runWithDatabaseConnectionOwner).toHaveBeenCalledTimes(1));
  expect(mocks.handleMaterialRoute).not.toHaveBeenCalled();
  release();

  await expect(response.then((result) => result.status)).resolves.toBe(200);
  expect(mocks.handleMaterialRoute).toHaveBeenCalledTimes(1);
  expect(mocks.handleVirtualFolderRoute).not.toHaveBeenCalled();
});
