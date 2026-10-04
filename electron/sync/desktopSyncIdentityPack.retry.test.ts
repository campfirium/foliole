import { expect, it, vi } from 'vitest';

import { buildSyncIdentityPackPage } from '../../lib/core/sync/syncIdentityPackPage.js';

const mocked = vi.hoisted(() => ({
  posts: 0,
  fetch: vi.fn(),
  decrypt: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: (task: () => unknown) => task()
}));
vi.mock('./workgroupKeyStore.js', () => ({
  loadDesktopWorkgroupKey: () => ({ group_key: 'test-key' })
}));
vi.mock('./desktopSyncGroupHttp.js', () => ({
  createDesktopWorkgroupPost: () => ({
    body: '{}', headers: { nonce: String(++mocked.posts) }
  })
}));
vi.mock('./desktopSyncGroupPackDownload.js', () => ({
  fetchDesktopSyncGroupPackBody: mocked.fetch
}));
vi.mock('./workgroupAeadFileNode.js', () => ({
  decryptDesktopWorkgroupResponseFile: mocked.decrypt
}));

import { downloadDesktopSyncIdentityArchive } from './desktopSyncIdentityPack.js';

const page = buildSyncIdentityPackPage({ group_id: 'group', source_peer_id: 'source',
  target_peer_id: 'target', source_view_id: '12345678-1234-1234-1234-123456789abc',
  page_index: 0, previous_page_id: null, objects: [] });
const peer = { endpoint_url: 'http://peer', group_id: 'group',
  local_device_id: 'target', peer_device_id: 'source' };

it('retries a reset archive download with a fresh authenticated request', async () => {
  mocked.posts = 0;
  mocked.fetch.mockReset().mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
  })).mockImplementation(async (args: { outputPath: string }) => args.outputPath);
  const archive = await downloadDesktopSyncIdentityArchive({ page, peer, outputRoot: '/tmp' });
  expect(archive).toBe('/tmp/0.zip');
  expect(mocked.fetch).toHaveBeenCalledTimes(2);
  expect(mocked.fetch.mock.calls.map(([args]) => args.headers.nonce)).toEqual(['1', '2']);
  expect(mocked.decrypt).toHaveBeenCalledTimes(1);
});

it('does not retry a rejected pack or silently exhaust more than one reset retry', async () => {
  mocked.posts = 0;
  mocked.fetch.mockReset().mockRejectedValue(new Error('sync_identity_pack_source_changed'));
  await expect(downloadDesktopSyncIdentityArchive({ page, peer, outputRoot: '/tmp' }))
    .rejects.toThrow('sync_identity_pack_source_changed');
  expect(mocked.fetch).toHaveBeenCalledTimes(1);
  mocked.fetch.mockReset().mockRejectedValue(Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
  }));
  await expect(downloadDesktopSyncIdentityArchive({ page, peer, outputRoot: '/tmp' }))
    .rejects.toThrow('fetch failed');
  expect(mocked.fetch).toHaveBeenCalledTimes(2);
});
