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
import { ANDROID_COMPANION_QUERY_DEFINITIONS } from '../../lib/core/database/androidCompanionQueryDefinitions.ts';
import { ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionResourceSchemaStatements.ts';
import { ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionSyncSchemaStatements.ts';
import { ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS } from '../../lib/core/database/androidCompanionSyncProtocolDefinitions.ts';
import { buildSchemaDriftReport } from './schema-inventory.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COMPANION_SCHEMA = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-core-schema.json');
const COMPANION_MIGRATION_SCHEMA = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-migration-schema.json');
const COMPANION_MUTATION_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-mutation-definitions.json');
const COMPANION_QUERY_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-query-definitions.json');
const COMPANION_SYNC_PROTOCOL_DEFINITIONS = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-sync-protocol-definitions.json');
const COMPANION_DATABASE_MIGRATION = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionDatabaseMigration.java'
);
const COMPANION_SYNC_CONFLICT_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncConflictQueryRules.java'
);
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
const COMPANION_APP_DATA_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionAppDataStore.java'
);
const COMPANION_APP_DATA_PLUGIN = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionAppDataPlugin.java'
);
const COMPANION_NAMED_MUTATION_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionNamedMutationStore.java'
);

describe('schema inventory drift gate', () => {
  it('generates the Android schema asset from the shared schema source', async () => {
    const schema = JSON.parse(await readFile(COMPANION_SCHEMA, 'utf8'));

    expect(schema.statements).toEqual([
      ...ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS,
      ...ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS,
      ...ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS,
      ...ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS
    ]);
  });

  it('keeps Android migration repair DDL in the generated migration asset', async () => {
    const schema = JSON.parse(await readFile(COMPANION_MIGRATION_SCHEMA, 'utf8'));
    const migrationSource = await readFile(COMPANION_DATABASE_MIGRATION, 'utf8');

    expect(schema.statementsByName).toEqual(ANDROID_COMPANION_MIGRATION_SCHEMA_STATEMENTS);
    expect(schema.plan).toEqual(ANDROID_COMPANION_MIGRATION_PLAN);
    expect(migrationSource).not.toMatch(/"CREATE (TABLE|INDEX)/);
    expect(migrationSource).not.toContain('"ALTER TABLE');
    expect(migrationSource).not.toContain('"DROP TABLE');
  });

  it('moves Android conflict query shape out of the custom Java store', async () => {
    const schema = JSON.parse(await readFile(COMPANION_QUERY_DEFINITIONS, 'utf8'));
    const conflictRulesSource = await readFile(COMPANION_SYNC_CONFLICT_STORE, 'utf8');

    expect(schema.queries).toEqual(ANDROID_COMPANION_QUERY_DEFINITIONS);
    expect(conflictRulesSource).toContain('FolioleCompanionQueryAssetKeys.ruleGroup(context, "syncConflictRead", "nodeConflicts")');
    expect(conflictRulesSource).not.toContain('database, "nodeConflicts"');
  });

  it('moves Android sync state row mutation SQL out of the custom Java store', async () => {
    const schema = JSON.parse(await readFile(COMPANION_MUTATION_DEFINITIONS, 'utf8'));

    expect(schema.statements).toEqual(ANDROID_COMPANION_MUTATION_DEFINITIONS);
    expect(schema.appDataClearMutations).toEqual(ANDROID_COMPANION_APP_DATA_CLEAR_MUTATIONS);
    await expect(readFile(COMPANION_SYNC_STATE_ROWS, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('moves Android app data clear table order out of Java', async () => {
    const source = await readFile(COMPANION_APP_DATA_STORE, 'utf8');

    expect(source).toContain('FolioleCompanionGeneratedMutationRunner.appDataClearMutations(context)');
    expect(source).toContain('FolioleCompanionMutationAssetKeys.appDataClearTable(context, mutation)');
    expect(source).toContain('FolioleCompanionMutationAssetKeys.appDataClearStatementName(context, mutation)');
    expect(source).not.toContain('shapeKey(context, "appDataClearMutation", key)');
    expect(source).not.toContain('mutation.getString("table")');
    expect(source).not.toContain('mutation.getString("statementName")');
    expect(source).not.toContain('new ClearMutation("');
  });

  it('clears Android pairing only after app data tables are cleared', async () => {
    const source = await readFile(COMPANION_APP_DATA_STORE, 'utf8');
    const tableClearIndex = source.indexOf('clearTables(context, database)');
    const pairingClearIndex = source.indexOf('FolioleCompanionPairingStore.clearPairingCredentials(context)');

    expect(pairingClearIndex).toBeGreaterThan(tableClearIndex);
  });

  it('executes no-arg Android app data clear mutations without empty bind args', async () => {
    const mutationStoreSource = await readFile(COMPANION_NAMED_MUTATION_STORE, 'utf8');
    const appDataPluginSource = await readFile(COMPANION_APP_DATA_PLUGIN, 'utf8');

    expect(mutationStoreSource).toContain('if (args == null || args.length == 0)');
    expect(mutationStoreSource).toContain('database.execSQL(sql);');
    expect(appDataPluginSource).toContain('FolioleCompanionPluginErrors.withCause("Failed to clear Foliole app data.", exception)');
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

    expect(report.sources).toEqual({
      androidAssetStatements: 32,
      androidJavaMigrationStatements: 0,
      desktopStatements: 48
    });
    expect(report.desktopOnly).toEqual([
      { classification: 'known-platform-only', table: 'import_runs' },
      { classification: 'known-platform-only', table: 'keep_import_items' },
      { classification: 'known-platform-only', table: 'mirror_articles' },
      { classification: 'known-platform-only', table: 'settings' },
      { classification: 'known-platform-only', table: 'sync_peers' }
    ]);
    expect(report.androidOnly).toEqual([
      { classification: 'known-platform-only', table: 'companion_meta' },
      { classification: 'known-platform-only', table: 'sync_push_ack' }
    ]);
    expect(report.androidJavaSharedDdl).toEqual([]);
    expect(report.unattributed).toEqual([]);
    expect(sharedDrift).toEqual({
      attachment_blobs: [
        'indexes.idx_attachment_blobs_availability',
        'indexes.idx_attachment_blobs_content_hash',
        'createSql'
      ],
      attachments: [
        'columns.pdf_index_attempt',
        'columns.pdf_index_error',
        'columns.pdf_index_status',
        'columns.pdf_index_version',
        'columns.pdf_indexed_at',
        'createSql'
      ],
      content_blob_data: ['createSql'],
      external_documents: [
        'columns.title',
        'indexes.idx_external_documents_folder_relative',
        'indexes.idx_external_documents_hash',
        'indexes.idx_external_documents_present_updated',
        'createSql'
      ],
      node_sync_versions: ['indexes.idx_node_sync_versions_object_created'],
      node_view_state: ['createSql'],
      pdf_page_text: ['createSql'],
      setting_records: [
        'columns.device_id',
        'columns.form_factor',
        'columns.platform',
        'indexes.idx_setting_records_device',
        'indexes.idx_setting_records_lookup',
        'createSql'
      ],
      sync_change_log: [
        'indexes.idx_sync_change_log_created',
        'indexes.idx_sync_change_log_device_created',
        'indexes.idx_sync_change_log_object',
        'indexes.idx_sync_change_log_result_version'
      ],
      sync_object_state: [
        'indexes.idx_sync_object_state_dirty',
        'indexes.idx_sync_object_state_type_updated'
      ]
    });
  });
});
