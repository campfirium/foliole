import { beforeEach, expect, it, vi } from 'vitest';

const pairingMock = vi.hoisted(() => ({
  createSignedRequestHeaders: vi.fn(async () => ({ 'X-Signature': 'signed' }))
}));

vi.mock('./companionWorkspacePairing', () => pairingMock);

import { DesktopSyncHttpError, fetchDesktopJson, postDesktopJson } from './companionDesktopSyncHttp';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('throws fetch errors with path, status, and response body', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('missing workspace', { status: 404 })));

  await expect(fetchDesktopJson('http://desktop.local/', '/companion/sync-index')).rejects.toMatchObject({
    body: 'missing workspace',
    path: '/companion/sync-index',
    status: 404
  });
  await expect(fetchDesktopJson('http://desktop.local/', '/companion/sync-index')).rejects.toBeInstanceOf(
    DesktopSyncHttpError
  );
});

it('throws post errors with path, status, and response body', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('bad payload', { status: 422 })));

  await expect(postDesktopJson('http://desktop.local/', '/companion/sync-objects', { objects: [] })).rejects.toMatchObject({
    body: 'bad payload',
    path: '/companion/sync-objects',
    status: 422
  });
});
