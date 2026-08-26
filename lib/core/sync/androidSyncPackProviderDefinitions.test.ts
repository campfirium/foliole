import { expect, it } from 'vitest';

import { ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS as definitions } from './androidSyncPackProviderDefinitions.js';
import {
  SYNC_PACK_FORMAT,
  SYNC_PACK_FORMAT_VERSION,
  SYNC_PACK_PAYLOAD_SCHEMA_VERSION
} from './syncPackEnvelopeContract.js';
import { SYNC_PACK_TABLE_NAMES } from './syncPackManifest.js';

it('uses the desktop sync-pack envelope, table, and protocol contracts', () => {
  expect(definitions.format).toBe(SYNC_PACK_FORMAT);
  expect(definitions.formatVersion).toBe(SYNC_PACK_FORMAT_VERSION);
  expect(definitions.schemaVersion).toBe(SYNC_PACK_PAYLOAD_SCHEMA_VERSION);
  expect(definitions.tableNames).toEqual(SYNC_PACK_TABLE_NAMES);
  expect(definitions.compression).toBe('zlib');
  expect(definitions.protocol).toMatchObject({
    capabilities: [
      'author-host-snapshots-v1', 'device-delivery-receipts-v1',
      'device-sync-groups-v1', 'group-key-routing-v1', 'lan-sync-v1', 'opaque-sync-refs-v1',
      'source-host-ownership-v1', 'sync-group-device-facts-v1',
      'system-entry-display-names-v1', 'workgroup-aead-v1'
    ],
    version: 4
  });
  expect(definitions.payloadPlans).toContainEqual(expect.objectContaining({
    objectType: 'watched_folder', sql: expect.stringContaining('s.host_name')
  }));
});
