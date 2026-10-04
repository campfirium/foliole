// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: migrationFixture.appDataDir, app_config_dir: path.join(migrationFixture.root, 'config'),
  app_cache_dir: path.join(migrationFixture.root, 'cache'), app_log_dir: path.join(migrationFixture.root, 'logs')
}) }));
vi.mock('../database/runtimeDataPaths.js', () => ({ resolveRuntimeDataPaths: () => ({
  assetsDir: migrationFixture.assetsDir, databasePath: openDatabaseConnection().dbPath, mode: 'library'
}) }));
vi.mock('../ipc/workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));

import { IMAGE_ADDRESS_MIGRATION_ID, runImageAddressMigration } from './imageAddressMigration.js';
import { migrationContext, migrationFixture, initializeMigrationFixture,
  imageBytes, oldKey, newKey, migrationNode, seedMigrationNode, stageMigrationSend } from './imageAddressMigrationTestSupport.js';
import { resolveAttachmentFile } from './resourceResolver.js';

beforeEach(initializeMigrationFixture);
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(migrationFixture.root, { recursive: true, force: true });
});

it('repairs verified images and references, preserves originals and text examples, versions anchors, and finishes once', async () => {
  const body = `![image](asset://${oldKey})\nTarget sentence.\n\`![example](asset://${oldKey})\`\nasset://${oldKey}`;
  seedMigrationNode('article', body);
  seedMigrationNode('child', 'Target sentence.', 'article', { id: 'anchor', kind: 'highlight',
    locator: { from: body.indexOf('Target sentence.'), to: body.indexOf('Target sentence.') + 16, originalText: 'Target sentence.' } });
  await fs.writeFile(path.join(migrationFixture.assetsDir, oldKey), imageBytes);
  expect(resolveAttachmentFile(oldKey, migrationFixture.assetsDir).status).toBe('missing_file');
  const originalVersion = migrationNode().current_version_id;
  await stageMigrationSend(originalVersion);
  const childVersion = migrationNode('child').current_version_id;
  const context = migrationContext();
  expect(await runImageAddressMigration(context)).toEqual({ changed: 1, completed: true });
  const current = migrationNode();
  expect(current.content).toBe(body.replace(`![image](asset://${oldKey})`, `![image](asset://${newKey})`));
  expect(JSON.parse(current.resource_references)).toEqual([{ storage_key: newKey, role: 'image', original_name: 'Original.jpg' }]);
  expect(current.current_version_id).not.toBe(originalVersion);
  expect(migrationNode('child').current_version_id).not.toBe(childVersion);
  expect(JSON.parse(migrationNode('child').anchor_link).locator.from).toBe(current.content.indexOf('Target sentence.'));
  expect(resolveAttachmentFile(newKey, migrationFixture.assetsDir).status).toBe('ready');
  expect(await fs.readFile(path.join(migrationFixture.assetsDir, oldKey))).toEqual(imageBytes);
  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ body_text: string }>('SELECT body_text FROM node_sync_versions WHERE version_id = ?', [originalVersion])?.body_text).toBe(body);
  const versions = driver.queryAll('SELECT * FROM node_sync_versions');
  const completedContext = migrationContext();
  expect(await runImageAddressMigration(completedContext)).toEqual({ changed: 0, completed: true });
  expect(completedContext.yieldIfNeeded).not.toHaveBeenCalled();
  expect(driver.queryAll('SELECT * FROM node_sync_versions')).toEqual(versions);
});

it('repairs a missing wrong alias using the correct file and handles reference-style images and source maps', async () => {
  seedMigrationNode('article', `![image][img]\n\n[img]: <asset://${oldKey}> "Original title"`);
  openDatabaseConnection().driver.execute('UPDATE nodes SET image_sources = ? WHERE id = ?',
    [JSON.stringify({ [oldKey]: { sourceUrl: 'https://example.org/image' } }), 'article']);
  await fs.writeFile(path.join(migrationFixture.assetsDir, newKey), imageBytes);
  expect(await runImageAddressMigration(migrationContext())).toEqual({ changed: 1, completed: true });
  expect(migrationNode().content).toContain(`![image](asset://${newKey} "Original title")`);
  expect(JSON.parse(migrationNode().image_sources)).toEqual({ [newKey]: { sourceUrl: 'https://example.org/image' } });
});

it('preserves a conflicting canonical target and leaves the run unfinished', async () => {
  const body = `![image](asset://${oldKey})`;
  seedMigrationNode('article', body);
  await fs.writeFile(path.join(migrationFixture.assetsDir, oldKey), imageBytes);
  await fs.writeFile(path.join(migrationFixture.assetsDir, newKey), 'protected bytes');
  await expect(runImageAddressMigration(migrationContext())).rejects.toThrow('image_migration_target_invalid');
  expect(migrationNode().content).toBe(body);
  expect(await fs.readFile(path.join(migrationFixture.assetsDir, newKey), 'utf8')).toBe('protected bytes');
  expect(openDatabaseConnection().driver.queryOne<{ status: string }>(
    'SELECT status FROM data_migration_state WHERE migration_id = ?', [IMAGE_ADDRESS_MIGRATION_ID])?.status).toBe('running');
});

it('skips hash mismatches and symlinks without modifying their nodes or following outside files', async () => {
  seedMigrationNode('article', `![image](asset://${oldKey})`);
  await fs.writeFile(path.join(migrationFixture.assetsDir, oldKey), Buffer.concat([imageBytes, Buffer.from('wrong hash')]));
  const context = migrationContext();
  const before = migrationNode();
  expect(await runImageAddressMigration(context)).toEqual({ changed: 0, completed: true });
  expect(migrationNode()).toEqual(before);
  expect(context.logger.info).toHaveBeenCalledWith('image_migration_file_skipped', expect.any(Object));
  openDatabaseConnection().driver.execute('DELETE FROM data_migration_state WHERE migration_id = ?', [IMAGE_ADDRESS_MIGRATION_ID]);
  await fs.unlink(path.join(migrationFixture.assetsDir, oldKey));
  const outside = path.join(migrationFixture.root, 'outside.png');
  await fs.writeFile(outside, imageBytes);
  await fs.symlink(outside, path.join(migrationFixture.assetsDir, oldKey));
  expect(await runImageAddressMigration(migrationContext())).toEqual({ changed: 0, completed: true });
  expect(migrationNode()).toEqual(before);
  await expect(fs.stat(path.join(migrationFixture.assetsDir, newKey))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('defers an active editor, re-reads later user edits, and resumes a cancelled pass without duplicate versions', async () => {
  seedMigrationNode('article', `![image](asset://${oldKey})`);
  const driver = openDatabaseConnection().driver;
  driver.execute('INSERT INTO node_version_local_holds VALUES (?, ?, ?, ?)', ['editor', 'article', migrationNode().current_version_id, 'now']);
  await fs.writeFile(path.join(migrationFixture.assetsDir, oldKey), imageBytes);
  expect(await runImageAddressMigration(migrationContext())).toEqual({ changed: 0, completed: false });
  driver.execute('DELETE FROM node_version_local_holds');
  seedMigrationNode('article', `User edited.\n![image](asset://${oldKey})`);
  seedMigrationNode('z-second', `![second](asset://${oldKey})`);
  const interrupted = migrationContext();
  const controller = new AbortController();
  interrupted.signal = controller.signal;
  interrupted.yieldIfNeeded = async () => {
    if (migrationNode().content.includes(newKey)) controller.abort();
    controller.signal.throwIfAborted();
  };
  await expect(runImageAddressMigration(interrupted)).rejects.toThrow();
  const firstVersion = migrationNode().current_version_id;
  expect(migrationNode().content).toBe(`User edited.\n![image](asset://${newKey})`);
  expect(migrationNode('z-second').content).toContain(oldKey);
  expect(await runImageAddressMigration(migrationContext())).toEqual({ changed: 1, completed: true });
  expect(migrationNode().current_version_id).toBe(firstVersion);
  expect(migrationNode('z-second').content).toContain(newKey);
});

it('rolls back body, references, anchors and versions together if version creation fails', async () => {
  seedMigrationNode('article', `![image](asset://${oldKey})`);
  await fs.writeFile(path.join(migrationFixture.assetsDir, oldKey), imageBytes);
  const driver = openDatabaseConnection().driver;
  const before = migrationNode();
  const versions = driver.queryAll('SELECT * FROM node_sync_versions');
  driver.execute(`CREATE TRIGGER refuse_repair_version BEFORE INSERT ON node_sync_versions
    BEGIN SELECT RAISE(ABORT, 'injected_version_failure'); END`);
  expect(await runImageAddressMigration(migrationContext())).toEqual({ changed: 0, completed: false });
  expect(migrationNode()).toEqual(before);
  expect(driver.queryAll('SELECT * FROM node_sync_versions')).toEqual(versions);
  driver.execute('DROP TRIGGER refuse_repair_version');
  expect(await runImageAddressMigration(migrationContext())).toEqual({ changed: 1, completed: true });
});
