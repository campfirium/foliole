// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  assertSyncPackSchemaVersion,
  SYNC_PACK_ENVELOPE_CONTRACT,
  SYNC_PACK_PAYLOAD_SCHEMA_VERSION,
  SYNC_PACK_SQLITE_TABLE_REQUIREMENTS
} from './syncPackEnvelopeContract.js';
import { SYNC_PACK_TABLE_NAMES } from './syncPackManifest.js';
import { PACK_SCHEMA } from './syncPackSchema.js';

it('defines the shared sync pack envelope and actual sqlite requirements', () => {
  expect(SYNC_PACK_ENVELOPE_CONTRACT).toMatchObject({
    compression: 'zlib',
    databaseEntry: 'incoming.db.deflate',
    format: 'foliole.sync-pack',
    formatVersion: 12,
    forbiddenDeviceIdentityKeys: [
      'canonical_library_path', 'device_anchor', 'device_identity_key', 'device_key', 'identity_key'
    ],
    manifestTableNames: SYNC_PACK_TABLE_NAMES,
    maximumSchemaVersion: SYNC_PACK_PAYLOAD_SCHEMA_VERSION,
    minimumSchemaVersion: SYNC_PACK_PAYLOAD_SCHEMA_VERSION
  });
  expect(Object.keys(SYNC_PACK_SQLITE_TABLE_REQUIREMENTS)).toEqual([
    'pack_manifest',
    ...SYNC_PACK_TABLE_NAMES
  ]);
});

it('only accepts the exact independent sync pack payload schema', () => {
  expect(SYNC_PACK_PAYLOAD_SCHEMA_VERSION).toBe(77);
  expect(() => assertSyncPackSchemaVersion(SYNC_PACK_PAYLOAD_SCHEMA_VERSION)).not.toThrow();
  expect(() => assertSyncPackSchemaVersion(SYNC_PACK_PAYLOAD_SCHEMA_VERSION - 1))
    .toThrow('unsupported_sync_pack_schema_version');
  expect(() => assertSyncPackSchemaVersion(SYNC_PACK_PAYLOAD_SCHEMA_VERSION + 1))
    .toThrow('unsupported_sync_pack_schema_version');
});

it('keeps the payload schema independent of host database versions', () => {
  const source = fs.readFileSync(path.resolve('lib/core/sync/syncPackEnvelopeContract.ts'), 'utf8');
  expect(source).not.toContain('DATABASE_SCHEMA_VERSION');
  expect(source).not.toContain('COMPANION_DATABASE_VERSION');
});

it('keeps required sqlite columns present in the producer schema', () => {
  const schemaSql = PACK_SCHEMA.join('\n');
  for (const [table, columns] of Object.entries(SYNC_PACK_SQLITE_TABLE_REQUIREMENTS)) {
    expect(schemaSql).toContain(`CREATE TABLE ${table}`);
    for (const column of columns) {
      expect(schemaSql).toMatch(new RegExp(`\\b${column}\\b`));
    }
  }
});
