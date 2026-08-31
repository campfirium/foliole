import type http from 'node:http';
import { PassThrough, Readable } from 'node:stream';

import { beforeEach, expect, it, vi } from 'vitest';

import { SqliteConnectionCoordinator } from '../database/sqliteConnectionCoordinator.js';

const REQUEST_ID = 'a1111111-1111-4111-8111-111111111111';
const ACCEPTANCE = {
  encrypted_group_info: { ciphertext: 'ciphertext', ephemeral_public_key: 'public-key', iv: 'iv' },
  expires_at: '2026-08-31T01:00:00.000Z',
  request_id: REQUEST_ID
};

const mocks = vi.hoisted(() => ({
  collect: vi.fn((): typeof ACCEPTANCE | null => ACCEPTANCE),
  loadProvider: vi.fn(),
  onOwnerAttempt: null as null | (() => void),
  runOwned: vi.fn()
}));

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: mocks.runOwned
}));
vi.mock('./desktopSyncGroupJoinProvider.js', () => ({
  loadDesktopSyncGroupJoinProvider: mocks.loadProvider
}));

import { handleSyncGroupJoinAcceptance } from './syncGroupJoinEndpoints.js';

let coordinator: SqliteConnectionCoordinator;

beforeEach(() => {
  vi.clearAllMocks();
  coordinator = new SqliteConnectionCoordinator();
  mocks.loadProvider.mockReturnValue({ collect: mocks.collect });
  mocks.onOwnerAttempt = null;
  mocks.runOwned.mockImplementation((execute: () => unknown) => {
    mocks.onOwnerAttempt?.();
    return coordinator.runExclusive(() => execute());
  });
});

it('serves one immediate join acceptance after the DNS-SD refresh owner releases', async () => {
  const refreshStarted = deferred<void>();
  const releaseRefresh = deferred<void>();
  const acceptFlow = coordinator.runExclusive(async () => {
    refreshStarted.resolve();
    await releaseRefresh.promise;
  });
  await refreshStarted.promise;

  const requestStream = new PassThrough();
  const request = Object.assign(requestStream, { headers: {} }) as unknown as http.IncomingMessage;
  const writeJson = vi.fn();
  const ownerAttempted = deferred<void>();
  mocks.onOwnerAttempt = ownerAttempted.resolve;
  const response = {} as http.ServerResponse;
  const immediateRequest = handleSyncGroupJoinAcceptance(request, response, writeJson);

  await Promise.resolve();
  expect(mocks.runOwned).not.toHaveBeenCalled();
  requestStream.end(JSON.stringify({ request_id: REQUEST_ID }));
  await ownerAttempted.promise;
  expect(mocks.collect).not.toHaveBeenCalled();
  expect(writeJson).not.toHaveBeenCalled();

  releaseRefresh.resolve();
  await Promise.all([acceptFlow, immediateRequest]);
  expect(mocks.collect).toHaveBeenCalledOnce();
  expect(writeJson).toHaveBeenCalledWith(request, response, 200, ACCEPTANCE);
});

it('serves the same accepted payload directly when no owner is active', async () => {
  const request = Readable.from([JSON.stringify({ request_id: REQUEST_ID })]);
  Object.assign(request, { headers: {} });
  const writeJson = vi.fn();
  const response = {} as http.ServerResponse;

  await handleSyncGroupJoinAcceptance(request as http.IncomingMessage, response, writeJson);

  expect(mocks.runOwned).toHaveBeenCalledOnce();
  expect(mocks.collect).toHaveBeenCalledOnce();
  expect(writeJson).toHaveBeenCalledWith(request, response, 200, ACCEPTANCE);
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}
