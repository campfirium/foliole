// @vitest-environment node
import { expect, it } from 'vitest';

import { publishWebDavRelayFile, webDavRelayStatus } from '../../lib/core/sync/webDavRelayPublication.js';

import { createDesktopWebDavRelayHttp, type DesktopWebDavRelayHttpStats } from './desktopWebDavRelayHttp.js';
import { setupDav } from './webDavRelayTransport.testSupport.js';

const newStats = (): DesktopWebDavRelayHttpStats => ({ requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 });

it('keeps the original ciphertext when MOVE commits but its response is lost', async () => {
  const upstream = process.env.FOLIOLE_TEST_WEBDAV_URL;
  const dav = setupDav(upstream);
  await new Promise<void>(resolve => dav.server.listen(0, '127.0.0.1', resolve));
  try {
    const address = dav.server.address();
    if (!address || typeof address === 'string') throw new Error('webdav_fixture_address_missing');
    const directory = new URL(`http://127.0.0.1:${address.port}${dav.sandboxPath}${crypto.randomUUID()}/`);
    if (upstream) expect(await createDesktopWebDavRelayHttp(newStats())(
      directory, { method: 'MKCOL' }, webDavRelayStatus)).toBe(201);
    const destination = new URL('packet.bin', directory);
    const bytes = crypto.getRandomValues(new Uint8Array(1024));
    const ciphertext = { bytes: bytes.length, async *chunks() { yield bytes.subarray(0, 13); yield bytes.subarray(13); } };

    const beforeFailure = dav.downloaded();
    const failed = newStats();
    dav.dropNextMove();
    await expect(publishWebDavRelayFile(createDesktopWebDavRelayHttp(failed), destination, ciphertext))
      .rejects.toThrow();
    expect(failed).toMatchObject({ requests: { GET: 2, PUT: 1, MOVE: 1 }, responses: 3, uploadedBytes: bytes.length });
    expect(failed.downloadedBytes).toBe(dav.downloaded() - beforeFailure);
    expect(failed.uploadedBytes).toBe(dav.uploaded());

    const before = dav.downloaded();
    const recovered = newStats();
    await expect(publishWebDavRelayFile(createDesktopWebDavRelayHttp(recovered), destination, ciphertext))
      .resolves.toBe('already_published');
    expect(recovered).toEqual({ requests: { GET: 1 }, responses: 1, uploadedBytes: 0, downloadedBytes: bytes.length });
    expect(recovered.downloadedBytes).toBe(dav.downloaded() - before);
    expect(dav.uploaded()).toBe(bytes.length);

    if (upstream) console.info('WebDAV publication evidence', JSON.stringify({ failed, recovered }));
    const conflicting = { bytes: 1, async *chunks() { yield new Uint8Array([42]); } };
    await expect(publishWebDavRelayFile(createDesktopWebDavRelayHttp(newStats()), destination, conflicting))
      .rejects.toThrow('webdav_relay_destination_conflict');
    expect(dav.uploaded()).toBe(bytes.length);
  } finally {
    await new Promise<void>(resolve => dav.server.close(() => resolve()));
  }
});
