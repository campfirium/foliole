// @vitest-environment node
import { createServer, type Server } from 'node:http';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ allowed: true, depth: 0, entered: () => {} }));
vi.mock('../database/connection.js', () => ({ registerDatabaseConnectionCleanup: () => {},
  runWithDatabaseConnectionOwner: async (run: () => unknown) => {
    runtime.depth += 1;
    try { return await run(); } finally { runtime.depth -= 1; }
  } }));
vi.mock('./companionRequestAuth.js', () => ({
  authenticateCompanionRequestContext: () => { runtime.entered(); return { auth: { device_id: 'phone', ok: true } }; },
  revalidateCompanionRequestAuthorization: () => runtime.allowed ? { ok: true }
    : { ok: false, status_code: 401, error: 'sync_group_device_not_active' }
}));
vi.mock('./companionLanResponses.js', () => ({ writeJson: (_request: unknown,
  response: import('node:http').ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
} }));

import { SYNC_SESSION_PATH, syncSessionReplySchema, type SyncSessionRequest } from '../../lib/platform/syncSessionContract.js';

import { handleCompanionSyncSession } from './companionLanSyncSession.js';
import { closeDesktopSyncChangeSessions, desktopSyncChangeSessions } from './desktopSyncChangeSessions.js';

let server: Server;
let endpoint: string;
beforeEach(async () => {
  runtime.allowed = true;
  runtime.entered = () => {};
  server = createServer((request, response) => { void handleCompanionSyncSession(request, response); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test_server_missing');
  endpoint = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  closeDesktopSyncChangeSessions();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

function request(input: SyncSessionRequest, signal?: AbortSignal) {
  return fetch(`${endpoint}${SYNC_SESSION_PATH}?input=${encodeURIComponent(JSON.stringify(input))}`, {
    method: input.operation === 'wait' ? 'GET' : 'POST', ...(signal ? { signal } : {})
  });
}

it('rechecks revoked membership before a held response and releases database ownership while waiting', async () => {
  const opened = syncSessionReplySchema.parse(await (await request({ operation: 'open' })).json());
  let arrived!: () => void;
  const entered = new Promise<void>(resolve => { arrived = resolve; });
  runtime.entered = arrived;
  const pending = request({ operation: 'wait', session: opened.session, marker: opened.marker });
  await entered;
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(runtime.depth).toBe(0);
  runtime.allowed = false;
  desktopSyncChangeSessions().changed();
  const response = await pending;
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: 'sync_group_device_not_active' });
});

it('cleans pending HTTP responses when the service stops', async () => {
  const opened = syncSessionReplySchema.parse(await (await request({ operation: 'open' })).json());
  let arrived!: () => void;
  const entered = new Promise<void>(resolve => { arrived = resolve; });
  runtime.entered = arrived;
  const pending = request({ operation: 'wait', session: opened.session, marker: opened.marker });
  await entered;
  await new Promise<void>(resolve => setImmediate(resolve));
  closeDesktopSyncChangeSessions();
  expect((await pending).status).toBe(409);
});
