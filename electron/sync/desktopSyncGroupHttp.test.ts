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

import { readDesktopWorkgroupResponse } from './desktopSyncGroupHttp.js';

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
