// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionCoreSchemaStatements.ts';
import { ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionHostSchemaStatements.ts';
import {
  ANDROID_COMPANION_MIGRATION_PLAN,
  ANDROID_COMPANION_MIGRATION_SCHEMA_STATEMENTS
} from '../../lib/core/database/androidCompanionMigrationSchemaStatements.ts';
import {
  ANDROID_COMPANION_APP_DATA_CLEAR_MUTATIONS,
  ANDROID_COMPANION_MUTATION_DEFINITIONS
} from '../../lib/core/database/androidCompanionMutationDefinitions.ts';
import { ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionResourceSchemaStatements.ts';
import { ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionSyncSchemaStatements.ts';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../lib/core/database/syncGroupSchemaStatements.ts';
import { SYNC_DELIVERY_TRIGGER_STATEMENTS } from '../../lib/core/database/syncDeliveryTriggerStatements.ts';
import { ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS } from '../../lib/core/database/androidCompanionSyncProtocolDefinitions.ts';
import {
  EXPECTED_SCHEMA_SOURCES,
  EXPECTED_SHARED_SCHEMA_DRIFT
} from './schema-inventory-expected.mjs';
import { buildSchemaDriftReport } from './schema-inventory.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COMPANION_SCHEMA = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-core-schema.json');
const COMPANION_MIGRATION_SCHEMA = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-migration-schema.json');
const COMPANION_MUTATION_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-mutation-definitions.json');
const COMPANION_SYNC_PROTOCOL_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-sync-protocol-definitions.json');
const COMPANION_SYNC_STATE_ROWS = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncStateRows.java'
);

describe('schema inventory drift gate', () => {
  it('generates the Android schema asset from the shared schema source', async () => {
    const schema = JSON.parse(await readFile(COMPANION_SCHEMA, 'utf8'));

    expect(schema.statements).toEqual([
      ...ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS,
      ...ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS,
      ...ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS,
      ...ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS,
      ...SYNC_GROUP_SCHEMA_STATEMENTS,
      ...SYNC_DELIVERY_TRIGGER_STATEMENTS
    ]);
  });

  it('keeps Android migration repair DDL in the generated migration asset', async () => {
    const schema = JSON.parse(await readFile(COMPANION_MIGRATION_SCHEMA, 'utf8'));

    expect(schema.statementsByName).toEqual(ANDROID_COMPANION_MIGRATION_SCHEMA_STATEMENTS);
    expect(schema.plan).toEqual(ANDROID_COMPANION_MIGRATION_PLAN);
  });

  it('moves Android sync state row mutation SQL out of the custom Java store', async () => {
    const schema = JSON.parse(await readFile(COMPANION_MUTATION_DEFINITIONS, 'utf8'));

    expect(schema.statements).toEqual(ANDROID_COMPANION_MUTATION_DEFINITIONS);
    expect(schema.appDataClearMutations).toEqual(ANDROID_COMPANION_APP_DATA_CLEAR_MUTATIONS);
    await expect(readFile(COMPANION_SYNC_STATE_ROWS, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps generated mutation definitions write-only', async () => {
    const schema = JSON.parse(await readFile(COMPANION_MUTATION_DEFINITIONS, 'utf8'));
    const readStatements = Object.entries(schema.statements).filter(([, sql]) =>
      /\b(?:SELECT|PRAGMA)\b|sqlite_master/i.test(sql)
    );

    expect(readStatements).toEqual([]);
  });

  it('generates Android sync protocol definitions from shared source', async () => {
    const definitions = JSON.parse(await readFile(COMPANION_SYNC_PROTOCOL_DEFINITIONS, 'utf8'));

    expect(definitions).toEqual(ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS);
  });

  it('keeps the desktop and Android core schema drift explicit', () => {
    const report = buildSchemaDriftReport();
    const sharedDrift = Object.fromEntries(
      report.shared.map((entry) => [
        entry.table,
        entry.differences.map((difference) => difference.field)
      ])
    );

    expect(report.sources).toEqual(EXPECTED_SCHEMA_SOURCES);
    expect(report.desktopOnly).toEqual([
      { classification: 'known-platform-only', table: 'external_folder_host_preferences' },
      { classification: 'known-platform-only', table: 'import_runs' },
      { classification: 'known-platform-only', table: 'incoming_updates' },
      { classification: 'known-platform-only', table: 'keep_import_item_cache' },
      { classification: 'known-platform-only', table: 'keep_import_items' },
      { classification: 'known-platform-only', table: 'mirror_articles' },
      { classification: 'known-platform-only', table: 'settings' },
      { classification: 'known-platform-only', table: 'sync_peers' }
    ]);
    expect(report.androidOnly).toEqual([
      { classification: 'known-platform-only', table: 'companion_meta' }
    ]);
    expect(report.androidJavaSharedDdl).toEqual([]);
    expect(report.unattributed).toEqual([]);
    expect(sharedDrift).toEqual(EXPECTED_SHARED_SCHEMA_DRIFT);
  });
});
