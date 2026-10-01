// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: migrationFixture.appDataDir, app_config_dir: path.join(migrationFixture.root, 'config'),
  app_cache_dir: path.join(migrationFixture.root, 'cache'), app_log_dir: path.join(migrationFixture.root, 'logs')
}) }));
vi.mock('../database/runtimeDataPaths.js', () => ({ resolveRuntimeDataPaths: () => ({
  assetsDir: migrationFixture.assetsDir, databasePath: openDatabaseConnection().dbPath, mode: 'library'
}) }));
vi.mock('../ipc/workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS } from '../../lib/core/database/syncStateSequenceSchemaStatements.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { hashTextBodyContent, upsertTextBodyBlob } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

import { runImageAddressMigration } from './imageAddressMigration.js';
import { migrationContext, migrationFixture, initializeMigrationFixture,
  imageBytes, oldKey, newKey, migrationNode, seedMigrationNode, stageMigrationSend } from './imageAddressMigrationTestSupport.js';
import { resolveAttachmentFile } from './resourceResolver.js';

function record(versionId: string): NativeSyncNodeRecord {
  const row = openDatabaseConnection().driver.queryOne<{ version_id: string; parent_version_id: string | null;
    content_hash: string; snapshot_json: string; body_text: string; host_name: string; created_at: string }>(
    'SELECT * FROM node_sync_versions WHERE version_id = ?', [versionId])!;
  return { object_type: 'node', object_id: 'article', version_id: row.version_id,
    parent_version_id: row.parent_version_id, parent_version_ids: row.parent_version_id ? [row.parent_version_id] : [],
    ancestor_version_ids: [], content_hash: row.content_hash, body_text: row.body_text,
    snapshot: JSON.parse(row.snapshot_json), host_name: row.host_name,
    updated_at: row.created_at, version_created_at: row.created_at };
}

beforeEach(initializeMigrationFixture);
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(migrationFixture.root, { recursive: true, force: true });
});

it('sends the repair as a normal descendant version to an independent replica with readable canonical resources', async () => {
  const target = new Database(path.join(migrationFixture.root, 'receiver.db'));
  const targetAssets = path.join(migrationFixture.root, 'receiver-assets');
  await fs.mkdir(targetAssets);
  for (const sql of [...DESKTOP_FRESH_SCHEMA_STATEMENTS, ...SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS]) target.exec(sql);
  const port = createBetterSqliteDbPort(target);
  try {
    seedMigrationNode('article', `![image](asset://${oldKey})`);
    const original = record(migrationNode().current_version_id);
    await upsertTextBodyBlob(port, original.body_text!, original.updated_at,
      await hashTextBodyContent(original.body_text!, {}));
    expect((await applySyncNodesWithDbPort(port, [original])).appliedIds).toEqual(['article']);
    await stageMigrationSend(original.version_id!);
    await fs.writeFile(path.join(migrationFixture.assetsDir, oldKey), imageBytes);
    expect(await runImageAddressMigration(migrationContext())).toEqual({ changed: 1, completed: true });
    const repaired = record(migrationNode().current_version_id);
    expect(repaired.parent_version_id).toBe(original.version_id);
    await upsertTextBodyBlob(port, repaired.body_text!, repaired.updated_at,
      await hashTextBodyContent(repaired.body_text!, {}));
    expect((await applySyncNodesWithDbPort(port, [repaired])).appliedIds).toEqual(['article']);
    await fs.copyFile(path.join(migrationFixture.assetsDir, newKey), path.join(targetAssets, newKey));
    const received = target.prepare('SELECT resource_references, current_version_id FROM nodes WHERE id = ?').get('article');
    expect(loadNodeBodyResolution(createBetterSqlite3Driver(target), 'article')).toMatchObject({ status: 'resolved', content: repaired.body_text });
    expect(received).toEqual({ resource_references: migrationNode().resource_references,
      current_version_id: repaired.version_id });
    expect(resolveAttachmentFile(newKey, targetAssets).status).toBe('ready');
    expect(target.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get(original.version_id))
      .toEqual({ body_text: original.body_text });
    expect((await applySyncNodesWithDbPort(port, [repaired])).appliedIds).toEqual([]);
    expect(target.pragma('foreign_key_check')).toEqual([]);
  } finally {
    target.close();
  }
});
