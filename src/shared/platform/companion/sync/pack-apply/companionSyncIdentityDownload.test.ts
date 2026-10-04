import { expect, it, vi } from 'vitest';

import { buildSyncIdentityPackPage } from '../../../../../../lib/core/sync/syncIdentityPackPage.js';
import { SYNC_PACK_TABLE_NAMES } from '../../../../../../lib/core/sync/syncPackManifest.js';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(async () => ({ body: 'encrypted', headers: { Authorization: 'signed' } })),
  download: vi.fn(async () => ({ packPath: '/cache/pack.db', manifest: {} })),
  apply: vi.fn(async () => { throw new Error('apply_failed'); }),
  remove: vi.fn(async () => true)
}));
vi.mock('../../network/signedRequest', () => ({
  prepareNativeCompanionWorkgroupRequest: mocks.prepare
}));
vi.mock('../../../companionSyncPackTransfer', () => ({
  downloadCompanionDesktopSyncIdentityPack: mocks.download,
  deleteCompanionDownloadedSyncPack: mocks.remove
}));
vi.mock('./companionSyncIdentityPackApply', () => ({
  applyCompanionSyncIdentityPackPath: mocks.apply
}));

function manifestFor(page: ReturnType<typeof buildSyncIdentityPackPage>) {
  return {
    contract: 'global-id-v1', pack_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    identity_page: page, tables: SYNC_PACK_TABLE_NAMES.map((name) => ({ name, row_count: 0 })),
    format: 'foliole.sync-pack', format_version: 21, schema_version: 92,
    compression: 'zlib', database_file: 'incoming.db.deflate',
    from_peer_id: 'source', to_peer_id: 'receiver',
    database_uncompressed_sha256: `sha256:${'a'.repeat(64)}`,
    database_compressed_sha256: `sha256:${'b'.repeat(64)}`
  };
}

it('sends one authenticated identity page and removes the native pack on apply failure', async () => {
  const page = buildSyncIdentityPackPage({ group_id: 'group', source_peer_id: 'source',
    target_peer_id: 'receiver', source_view_id: '12345678-1234-1234-1234-123456789abc',
    page_index: 0, previous_page_id: null, objects: [] });
  mocks.download.mockResolvedValueOnce({ packPath: '/cache/pack.db', manifest: manifestFor(page) });
  const { downloadAndApplyCompanionSyncIdentityPage } =
    await import('./companionSyncIdentityDownload');
  await expect(downloadAndApplyCompanionSyncIdentityPage({
    endpointUrl: 'http://desktop.local', hostName: 'mobile', page
  })).rejects.toThrow('apply_failed');
  expect(mocks.prepare).toHaveBeenCalledWith({
    bodyText: JSON.stringify(page), endpointUrl: 'http://desktop.local', method: 'POST',
    pathWithQuery: '/companion/sync-identity-pack'
  });
  expect(mocks.download).toHaveBeenCalledWith({
    body: 'encrypted', expectedPeerId: 'receiver', expectedSourcePeerId: 'source',
    headers: { Authorization: 'signed' }, url: 'http://desktop.local/companion/sync-identity-pack'
  });
  expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ expectedPageId: page.page_id }));
  expect(mocks.remove).toHaveBeenCalledWith('/cache/pack.db');
});

it('binds a staged restore download to the selected event and set', async () => {
  const page = buildSyncIdentityPackPage({ group_id: 'group', source_peer_id: 'source',
    target_peer_id: 'receiver', source_view_id: '12345678-1234-1234-1234-123456789abc',
    page_index: 0, previous_page_id: null, objects: [],
    restore_id: 'restore-1', restore_set_id: 'a'.repeat(64) });
  mocks.download.mockResolvedValueOnce({ packPath: '/cache/restore.db',
    manifest: manifestFor(page) });
  const { downloadCompanionSyncIdentityPage } = await import('./companionSyncIdentityDownload');
  const staged = await downloadCompanionSyncIdentityPage({
    endpointUrl: 'http://desktop.local', page });
  expect(staged.manifest.identity_page.restore_set_id).toBe(page.restore_set_id);
  expect(mocks.prepare).toHaveBeenLastCalledWith(expect.objectContaining({
    pathWithQuery: '/companion/sync-identity-pack?restore_id=restore-1'
  }));
  await staged.cleanup();
  expect(mocks.remove).toHaveBeenCalledWith('/cache/restore.db');
});
