import { expect, it } from 'vitest';

import { parseSyncIdentityPackContainerManifest } from './syncIdentityPackManifest.js';
import { buildSyncIdentityPackPage } from './syncIdentityPackPage.js';
import { SYNC_PACK_TABLE_NAMES } from './syncPackManifest.js';

it('rejects legacy sequence fields and a pack addressed to another member', () => {
  const page = buildSyncIdentityPackPage({ group_id: 'group', source_peer_id: 'source',
    target_peer_id: 'receiver', source_view_id: '12345678-1234-1234-1234-123456789abc',
    page_index: 0, previous_page_id: null, objects: [] });
  const manifest = {
    contract: 'global-id-v1', pack_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    identity_page: page, tables: SYNC_PACK_TABLE_NAMES.map((name) => ({ name, row_count: 0 })),
    format: 'foliole.sync-pack', format_version: 21, schema_version: 92,
    compression: 'zlib', database_file: 'incoming.db.deflate',
    from_peer_id: 'source', to_peer_id: 'receiver',
    database_uncompressed_sha256: `sha256:${'a'.repeat(64)}`,
    database_compressed_sha256: `sha256:${'b'.repeat(64)}`
  };
  const expected = { sourcePeerId: 'source', targetPeerId: 'receiver' };
  expect(parseSyncIdentityPackContainerManifest(manifest, expected).identity_page).toEqual(page);
  expect(() => parseSyncIdentityPackContainerManifest({ ...manifest, from_state_seq: 0 }, expected))
    .toThrow('sync_identity_pack_sequence_forbidden');
  expect(() => parseSyncIdentityPackContainerManifest(manifest, {
    ...expected, targetPeerId: 'different'
  })).toThrow('sync_identity_pack_manifest_invalid');
});

it('binds structural dependencies to the v21 container manifest', () => {
  const page = buildSyncIdentityPackPage({ group_id: 'group', source_peer_id: 'source',
    target_peer_id: 'receiver', source_view_id: '12345678-1234-1234-1234-123456789abc',
    page_index: 0, previous_page_id: null, objects: [] });
  const dependency = { object_type: 'node', object_id: 'parent', fingerprint: 'a'.repeat(64) };
  const manifest = {
    contract: 'global-id-v1', pack_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    identity_page: page, dependencies: [dependency],
    tables: SYNC_PACK_TABLE_NAMES.map((name) => ({ name, row_count: 0 })),
    format: 'foliole.sync-pack', format_version: 21, schema_version: 92,
    compression: 'zlib', database_file: 'incoming.db.deflate',
    from_peer_id: 'source', to_peer_id: 'receiver',
    database_uncompressed_sha256: `sha256:${'a'.repeat(64)}`,
    database_compressed_sha256: `sha256:${'b'.repeat(64)}`
  };
  const expected = { sourcePeerId: 'source', targetPeerId: 'receiver' };
  expect(parseSyncIdentityPackContainerManifest(manifest, expected).dependencies).toEqual([dependency]);
  expect(() => parseSyncIdentityPackContainerManifest({
    ...manifest, dependencies: [dependency, dependency]
  }, expected)).toThrow('sync_identity_pack_dependencies_invalid');
  expect(() => parseSyncIdentityPackContainerManifest({
    ...manifest, dependencies: [{ ...dependency, fingerprint: 'bad' }]
  }, expected)).toThrow('sync_identity_pack_dependencies_invalid');
});
