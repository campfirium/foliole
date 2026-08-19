import { expect, it } from 'vitest';

import { ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS as definitions } from './androidSyncPackProviderDefinitions.js';
import { SYNC_PACK_FORMAT, SYNC_PACK_FORMAT_VERSION } from './syncPackEnvelopeContract.js';
import { SYNC_PACK_TABLE_NAMES } from './syncPackManifest.js';

it('uses the desktop sync-pack envelope, table, and protocol contracts', () => {
  expect(definitions.format).toBe(SYNC_PACK_FORMAT);
  expect(definitions.formatVersion).toBe(SYNC_PACK_FORMAT_VERSION);
  expect(definitions.tableNames).toEqual(SYNC_PACK_TABLE_NAMES);
  expect(definitions.compression).toBe('zlib');
  expect(definitions.protocol).toMatchObject({
    capabilities: [
      'author-host-snapshots-v1', 'host-workgroup-members-v1', 'lan-sync-v1', 'opaque-sync-refs-v1',
      'sync-group-facts-v1', 'workgroup-aead-v1'
    ],
    version: 2
  });
});
