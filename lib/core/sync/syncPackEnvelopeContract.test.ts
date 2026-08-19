// @vitest-environment node

import { expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION } from '../database/databaseSchemaVersion.js';

import {
  assertSyncPackSchemaVersion,
  SYNC_PACK_ENVELOPE_CONTRACT,
  SYNC_PACK_SQLITE_TABLE_REQUIREMENTS
} from './syncPackEnvelopeContract.js';
import { SYNC_PACK_TABLE_NAMES } from './syncPackManifest.js';
import { PACK_SCHEMA } from './syncPackSchema.js';

it('defines the shared sync pack envelope and actual sqlite requirements', () => {
  expect(SYNC_PACK_ENVELOPE_CONTRACT).toMatchObject({
    compression: 'zlib',
    databaseEntry: 'incoming.db.deflate',
    format: 'foliole.sync-pack',
    formatVersion: 7,
    manifestTableNames: SYNC_PACK_TABLE_NAMES,
    maximumSchemaVersion: DATABASE_SCHEMA_VERSION,
    minimumSchemaVersion: DATABASE_SCHEMA_VERSION
  });
  expect(Object.keys(SYNC_PACK_SQLITE_TABLE_REQUIREMENTS)).toEqual([
    'pack_manifest',
    ...SYNC_PACK_TABLE_NAMES
  ]);
});

it('only accepts sync packs from the exact local database schema', () => {
  expect(() => assertSyncPackSchemaVersion(DATABASE_SCHEMA_VERSION)).not.toThrow();
  expect(() => assertSyncPackSchemaVersion(DATABASE_SCHEMA_VERSION - 1))
    .toThrow('unsupported_sync_pack_schema_version');
  expect(() => assertSyncPackSchemaVersion(DATABASE_SCHEMA_VERSION + 1))
    .toThrow('unsupported_sync_pack_schema_version');
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
