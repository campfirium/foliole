import { expect, it, vi } from 'vitest';

import { buildSyncIdentityPackPage } from '../../../../../../lib/core/sync/syncIdentityPackPage.js';
import { SYNC_PACK_TABLE_NAMES } from '../../../../../../lib/core/sync/syncPackManifest.js';

import { applyCompanionSyncIdentityPackPath,
  applyCompanionSyncIdentityPackWithDbPort } from './companionSyncIdentityPackApply.js';

const apply = vi.hoisted(() => vi.fn(async () => { throw new Error('apply_failed'); }));
vi.mock('../../../../../../lib/core/sync/syncIdentityPackApply.js', () => ({
  applySyncIdentityPackWithDbPort: apply
}));

function manifest() {
  return {
    contract: 'global-id-v1', pack_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    identity_page: buildSyncIdentityPackPage({ group_id: 'group', source_peer_id: 'source',
      target_peer_id: 'receiver', source_view_id: '12345678-1234-1234-1234-123456789abc',
      page_index: 0, previous_page_id: null, objects: [] }),
    tables: SYNC_PACK_TABLE_NAMES.map((name) => ({ name, row_count: 0 })),
    format: 'foliole.sync-pack', format_version: 21, schema_version: 92,
    compression: 'zlib', database_file: 'incoming.db.deflate',
    from_peer_id: 'source', to_peer_id: 'receiver',
    database_uncompressed_sha256: `sha256:${'a'.repeat(64)}`,
    database_compressed_sha256: `sha256:${'b'.repeat(64)}`
  };
}

it('rejects a pack for another device before attaching it', async () => {
  const port = { run: vi.fn() };
  await expect(applyCompanionSyncIdentityPackWithDbPort(port as never, {
    hostName: 'receiver', manifest: manifest(), packPath: '/cache/pack.db',
    sourcePeerId: 'source', targetPeerId: 'another-device'
  })).rejects.toThrow('sync_identity_pack_manifest_invalid');
  expect(port.run).not.toHaveBeenCalled();
});

it('rejects a validly addressed replacement page before attaching it', async () => {
  const port = { run: vi.fn() };
  await expect(applyCompanionSyncIdentityPackWithDbPort(port as never, {
    expectedPageId: 'different-page', hostName: 'receiver', manifest: manifest(),
    packPath: '/cache/pack.db', sourcePeerId: 'source', targetPeerId: 'receiver'
  })).rejects.toThrow('sync_identity_pack_page_changed');
  expect(port.run).not.toHaveBeenCalled();
});

it('detaches an authenticated identity database after an apply failure', async () => {
  const port = { run: vi.fn(async () => {}) };
  await expect(applyCompanionSyncIdentityPackWithDbPort(port as never, {
    hostName: 'receiver', manifest: manifest(), packPath: "/cache/pack's.db",
    sourcePeerId: 'source', targetPeerId: 'receiver'
  })).rejects.toThrow('apply_failed');
  expect(port.run).toHaveBeenNthCalledWith(1, "ATTACH DATABASE '/cache/pack''s.db' AS inc");
  expect(port.run).toHaveBeenNthCalledWith(2, 'DETACH DATABASE inc');
});

it('rejects identity pack application outside the native companion runtime', async () => {
  await expect(applyCompanionSyncIdentityPackPath({
    hostName: 'web', manifest: manifest(), packPath: '/cache/pack.db',
    sourcePeerId: 'source', targetPeerId: 'receiver'
  })).rejects.toMatchObject({ capability: 'sync-pack-apply', platform: 'web' });
});
