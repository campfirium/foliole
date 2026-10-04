import { expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  decrypt: vi.fn((args: unknown) => {
    void args;
    return Buffer.from('decrypted');
  }),
  ownerActive: false
}));

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => {
    runtime.ownerActive = true;
    try { return await execute(); }
    finally { runtime.ownerActive = false; }
  }
}));
vi.mock('./desktopSyncGroupSignedHeaders.js', () => ({
  createDesktopSyncGroupSignedHeaders: vi.fn(() => ({}))
}));
vi.mock('./workgroupHttpCrypto.js', () => ({
  decryptDesktopWorkgroupResponse: (args: unknown) => {
    expect(runtime.ownerActive).toBe(true);
    return runtime.decrypt(args);
  },
  encryptDesktopWorkgroupRequest: vi.fn(() => 'encrypted'),
  WORKGROUP_ENVELOPE_CONTENT_TYPE: 'application/vnd.foliole.workgroup-aead+json'
}));

import { fetchDesktopWorkgroupJson,
  readDesktopWorkgroupResponse } from './desktopSyncGroupHttp.js';
import { createDesktopSyncGroupSignedHeaders } from './desktopSyncGroupSignedHeaders.js';

it('decrypts a downloaded workgroup response inside the database owner queue', async () => {
  const response = new Response('encrypted', {
    headers: { 'content-type': 'application/vnd.foliole.workgroup-aead+json' }
  });

  await expect(readDesktopWorkgroupResponse({
    contentType: 'application/zip', groupId: 'group-1', method: 'GET',
    pathWithQuery: '/companion/sync-pack?after_state_seq=0', response
  })).resolves.toEqual(Buffer.from('decrypted'));
  expect(runtime.decrypt).toHaveBeenCalledOnce();
});

it('decrypts an authenticated HTTP error before reporting its exact reason', async () => {
  runtime.decrypt.mockReturnValueOnce(Buffer.from('{"error":"sync_group_device_not_active"}'));
  const response = new Response('encrypted', {
    status: 401,
    headers: {
      'content-type': 'application/vnd.foliole.workgroup-aead+json',
      'x-foliole-original-content-type': 'application/json; charset=utf-8'
    }
  });

  await expect(readDesktopWorkgroupResponse({
    contentType: 'application/zip', groupId: 'group-1', method: 'GET',
    pathWithQuery: '/companion/sync-pack?after_state_seq=0', response
  })).rejects.toThrow('sync_group_http_401:sync_group_device_not_active');
  expect(runtime.decrypt).toHaveBeenCalledWith(expect.objectContaining({
    contentType: 'application/json; charset=utf-8'
  }));
});

it('retries a reset authenticated GET with fresh signed headers', async () => {
  const reset = Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
  });
  const fetchMock = vi.fn().mockRejectedValueOnce(reset).mockResolvedValueOnce(new Response(
    'encrypted', { headers: { 'content-type': 'application/vnd.foliole.workgroup-aead+json' } }
  ));
  vi.stubGlobal('fetch', fetchMock);
  runtime.decrypt.mockReturnValueOnce(Buffer.from('{"ok":true}'));
  vi.mocked(createDesktopSyncGroupSignedHeaders).mockClear();
  try {
    await expect(fetchDesktopWorkgroupJson<{ ok: boolean }>({
      endpointUrl: 'http://peer', groupId: 'group-1', localDeviceId: 'local',
      pathWithQuery: '/companion/sync-identity-summary', secret: 'secret'
    })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(createDesktopSyncGroupSignedHeaders).toHaveBeenCalledTimes(2);
  } finally { vi.unstubAllGlobals(); }
});
