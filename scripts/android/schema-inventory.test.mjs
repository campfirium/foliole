// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionCoreSchemaStatements.ts';
import { ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionResourceSchemaStatements.ts';
import { ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionSyncSchemaStatements.ts';
import { buildSchemaDriftReport } from './schema-inventory.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COMPANION_SCHEMA = path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'assets', 'companion-core-schema.json');

describe('schema inventory drift gate', () => {
  it('generates the Android schema asset from the shared schema source', async () => {
    const schema = JSON.parse(await readFile(COMPANION_SCHEMA, 'utf8'));

    expect(schema.statements).toEqual([
      ...ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS,
      ...ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS,
      ...ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS
    ]);
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
      androidAssetStatements: 29,
      androidJavaMigrationStatements: 2,
      desktopStatements: 48
    });
    expect(report.desktopOnly).toEqual([
      { classification: 'known-platform-only', table: 'import_runs' },
      { classification: 'known-platform-only', table: 'keep_import_items' },
      { classification: 'known-platform-only', table: 'mirror_articles' },
      { classification: 'known-platform-only', table: 'settings' },
      { classification: 'known-platform-only', table: 'sync_peers' }
    ]);
    expect(report.androidOnly).toEqual([]);
    expect(report.androidJavaSharedDdl).toEqual([
      { classification: 'legacy-repair', table: 'sync_object_state_next' },
      { classification: 'known-platform-only', table: 'sync_push_ack' }
    ]);
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
