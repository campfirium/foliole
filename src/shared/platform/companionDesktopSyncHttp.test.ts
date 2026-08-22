import { beforeEach, expect, it, vi } from 'vitest';

const pairingMock = vi.hoisted(() => ({
  createSignedRequestHeaders: vi.fn(async () => ({ 'X-Signature': 'signed' }))
}));
const workgroupMock = vi.hoisted(() => ({
  prepare: vi.fn(async (): Promise<null | { body: string; headers: Record<string, string> }> => null)
}));

const capacitorMock = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  isNativePlatform: vi.fn(() => false),
  plugin: {
    desktopHttpRequest: vi.fn()
  }
}));

vi.mock('./companionWorkspacePairing', () => pairingMock);
vi.mock('./companion/network/signedRequest', () => ({
  prepareNativeCompanionWorkgroupRequestIfPresent: workgroupMock.prepare
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.getPlatform,
    isNativePlatform: capacitorMock.isNativePlatform
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));

import { DesktopSyncHttpError, fetchDesktopJson, postDesktopJson } from './companionDesktopSyncHttp';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  capacitorMock.getPlatform.mockReturnValue('web');
  capacitorMock.isNativePlatform.mockReturnValue(false);
  workgroupMock.prepare.mockResolvedValue(null);
});

it('sends the opaque Android workgroup envelope that its signature covers', async () => {
  capacitorMock.getPlatform.mockReturnValue('android');
  capacitorMock.isNativePlatform.mockReturnValue(true);
  capacitorMock.plugin.desktopHttpRequest.mockResolvedValue({ body: '{"ok":true}', status: 200 });
  workgroupMock.prepare.mockResolvedValue({
    body: 'encrypted-push', headers: { 'Content-Type': 'application/vnd.foliole.workgroup-aead+json' }
  });

  await postDesktopJson('http://desktop.local/', '/companion/sync-push', { items: [] });

  expect(capacitorMock.plugin.desktopHttpRequest).toHaveBeenCalledWith(expect.objectContaining({
    body: 'encrypted-push', headers: { 'Content-Type': 'application/vnd.foliole.workgroup-aead+json' }
  }));
  expect(pairingMock.createSignedRequestHeaders).not.toHaveBeenCalled();
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

it.each(['android', 'ios'])('routes desktop HTTP through the native %s bridge', async (platform) => {
  capacitorMock.getPlatform.mockReturnValue(platform);
  capacitorMock.isNativePlatform.mockReturnValue(true);
  capacitorMock.plugin.desktopHttpRequest.mockResolvedValue({
    body: JSON.stringify({ ok: true }),
    status: 200
  });
  vi.stubGlobal('fetch', vi.fn());

  await expect(fetchDesktopJson('http://desktop.local/', '/companion/sync-index')).resolves.toEqual({ ok: true });

  expect(fetch).not.toHaveBeenCalled();
  expect(capacitorMock.plugin.desktopHttpRequest).toHaveBeenCalledWith({
    body: undefined,
    headers: { 'X-Signature': 'signed' },
    method: 'GET',
    url: 'http://desktop.local/companion/sync-index'
  });
});
