// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-watched-folder-bindings-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('../import/managedInboxEvents.js', () => ({
  notifyManagedInboxUpdated: vi.fn()
}));

import { runKeepImportRule } from '../import/keepImportService.js';
import { confirmWatchedFolderReconnect, previewWatchedFolderReconnect } from '../import/watchedFolderReconnect.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import {
  disconnectWatchedFolderBinding,
  loadWatchedFolderBindingState,
  recordWatchedImportSourceMapping,
  removeWatchedFolderBinding,
  resolveExecutableWatchedBinding,
  upsertChangedWatchedFolderSource
} from './watchedFolderBindings.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-watched-folder-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('uses the active sync-group Host when separating local and remote sources', () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO sync_groups
    (group_id, display_name, timeline_id, created_by_host_name, created_at, updated_at)
    VALUES ('group-a', 'Workgroup', 'timeline-a', 'This Mac', 'now', 'now')`);
  driver.execute(`INSERT INTO sync_group_members
    (group_id, host_name, host_platform, state, approved_by_host_name,
     authorization_id, joined_at, updated_at)
    VALUES ('group-a', 'This Mac', 'darwin', 'active', 'This Mac', 'authorization-a', 'now', 'now')`);
  driver.execute(`INSERT INTO sync_group_local_state
    (singleton_id, group_id, local_host_name, member_state, updated_at)
    VALUES (1, 'group-a', 'This Mac', 'active', 'now')`);

  expect(loadWatchedFolderBindingState().current_host_name).toBe('This Mac');
});

it('disconnects and reconnects one watched source while preserving its imported source mapping', async () => {
  const firstPath = path.join(tempRoot, 'watched-a');
  const nextPath = path.join(tempRoot, 'watched-b');
  await fs.mkdir(firstPath, { recursive: true });
  await fs.mkdir(nextPath, { recursive: true });
  await fs.writeFile(path.join(nextPath, 'note.md'), '# Note');
  const source = {
    actionMode: 'keep' as const,
    archivePath: '',
    highlightMode: 'merged' as const,
    highlightPath: '',
    id: 'watched-rule',
    keepPreview: null,
    keepState: 'enabled' as const,
    primaryPath: firstPath
  };
  const binding = upsertChangedWatchedFolderSource(source, '2026-08-18T00:00:00.000Z')!;
  openDatabaseConnection().driver.execute(`INSERT INTO import_sources (
    source_fingerprint, provider, source_kind, source_name, source_locator, first_imported_at,
    last_imported_at, last_content_fingerprint, latest_node_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ['fingerprint', 'markdown', 'file', 'note.md', path.join(firstPath, 'note.md'), 'now', 'now', 'hash', 'node-1']);
  recordWatchedImportSourceMapping({
    directoryPath: firstPath,
    relativePath: 'note.md',
    ruleId: 'watched-rule',
    sourceFingerprint: 'fingerprint',
    updatedAt: '2026-08-18T00:01:00.000Z'
  });

  disconnectWatchedFolderBinding(binding.binding_id);
  expect(resolveExecutableWatchedBinding('watched-rule', firstPath).executable).toBe(false);
  expect(openDatabaseConnection().driver.queryOne(
    "SELECT latest_node_id, watched_binding_id FROM import_sources WHERE source_fingerprint = 'fingerprint'"
  )).toEqual({ latest_node_id: 'node-1', watched_binding_id: binding.binding_id });

  await expect(previewWatchedFolderReconnect(binding.binding_id, nextPath)).resolves.toMatchObject({
    matched_count: 1, missing_count: 0, new_count: 0
  });
  await confirmWatchedFolderReconnect({ bindingId: binding.binding_id, folderPath: nextPath });
  expect(resolveExecutableWatchedBinding(binding.binding_id, nextPath).executable).toBe(true);
});

it('does not claim or mutate a watched Source owned by another Host', async () => {
  const folderPath = path.join(tempRoot, 'remote-watched');
  await fs.mkdir(folderPath, { recursive: true });
  const source = {
    actionMode: 'keep' as const, archivePath: '', highlightMode: 'merged' as const, highlightPath: '',
    id: 'remote-rule', keepPreview: null, keepState: 'enabled' as const, primaryPath: folderPath
  };
  const binding = upsertChangedWatchedFolderSource(source, '2026-08-18T00:00:00.000Z')!;
  const driver = openDatabaseConnection().driver;
  driver.execute("UPDATE desktop_sources SET host_name = 'Other Mac' WHERE source_ref = ?", [binding.source_ref]);

  expect(upsertChangedWatchedFolderSource(source, '2026-08-18T00:01:00.000Z')).toBeNull();
  await expect(previewWatchedFolderReconnect(binding.binding_id, folderPath))
    .rejects.toThrow('watched_folder_not_local');
  expect(() => disconnectWatchedFolderBinding(binding.binding_id)).toThrow('watched_folder_not_local');
  expect(() => removeWatchedFolderBinding(binding.binding_id)).toThrow('watched_folder_not_local');
  expect(driver.queryOne('SELECT host_name FROM desktop_sources WHERE source_ref = ?', [binding.source_ref]))
    .toEqual({ host_name: 'Other Mac' });
});

it('removes only the watched connection record and keeps imported data', async () => {
  const folderPath = path.join(tempRoot, 'watched');
  await fs.mkdir(folderPath, { recursive: true });
  const binding = upsertChangedWatchedFolderSource({
    actionMode: 'keep', archivePath: '', highlightMode: 'merged', highlightPath: '', id: 'watched-rule',
    keepPreview: null, keepState: 'enabled', primaryPath: folderPath
  }, '2026-08-18T00:00:00.000Z')!;
  openDatabaseConnection().driver.execute(`INSERT INTO import_sources (
    source_fingerprint, provider, source_kind, source_name, source_locator, first_imported_at,
    last_imported_at, last_content_fingerprint, latest_node_id, watched_binding_id, watched_relative_path
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ['fingerprint', 'markdown', 'file', 'note.md', 'note.md', 'now', 'now', 'hash', 'node-1', binding.binding_id, 'note.md']);

  removeWatchedFolderBinding(binding.binding_id);

  expect(openDatabaseConnection().driver.queryOne(
    'SELECT binding_id FROM watched_folder_bindings WHERE binding_id = ?', [binding.binding_id]
  )).toBeUndefined();
  expect(openDatabaseConnection().driver.queryOne(
    'SELECT source_ref FROM desktop_sources WHERE source_ref = ?', [binding.source_ref]
  )).toBeUndefined();
  expect(openDatabaseConnection().driver.queryOne(
    "SELECT latest_node_id FROM import_sources WHERE source_fingerprint = 'fingerprint'"
  )).toEqual({ latest_node_id: 'node-1' });
});

it('preserves the original topic identity and surfaces its update after reconnecting at a new path', async () => {
  const firstPath = path.join(tempRoot, 'watched-original');
  const nextPath = path.join(tempRoot, 'watched-reconnected');
  await fs.mkdir(firstPath, { recursive: true });
  await fs.mkdir(nextPath, { recursive: true });
  await fs.writeFile(path.join(firstPath, 'note.md'), '# Original\nFirst body');
  await fs.writeFile(path.join(nextPath, 'note.md'), '# Original\nUpdated body');
  await fs.utimes(path.join(firstPath, 'note.md'), new Date('2026-08-18T00:00:00Z'), new Date('2026-08-18T00:00:00Z'));
  await fs.utimes(path.join(nextPath, 'note.md'), new Date('2026-08-18T00:01:00Z'), new Date('2026-08-18T00:01:00Z'));
  const source = {
    actionMode: 'keep' as const, archivePath: '', highlightMode: 'merged' as const, highlightPath: '',
    id: 'continuity-rule', keepPreview: null, keepState: 'enabled' as const, primaryPath: firstPath
  };
  const binding = upsertChangedWatchedFolderSource(source, '2026-08-18T00:00:00.000Z')!;
  await runKeepImportRule({
    directoryPath: firstPath, highlightPolicy: 'reference_only', ruleId: source.id, sourceType: 'generic'
  });
  const first = openDatabaseConnection().driver.queryOne<{
    latest_node_id: string;
    source_fingerprint: string;
  }>(`SELECT source_fingerprint, latest_node_id FROM import_sources
      WHERE watched_binding_id = ? AND watched_relative_path = 'note.md'`, [binding.binding_id])!;

  disconnectWatchedFolderBinding(binding.binding_id);
  await confirmWatchedFolderReconnect({ bindingId: binding.binding_id, folderPath: nextPath });
  const reconnectRun = await runKeepImportRule({
    directoryPath: nextPath, highlightPolicy: 'reference_only', ruleId: binding.binding_id, sourceType: 'generic'
  });
  expect(reconnectRun).toEqual([expect.objectContaining({
    action: 'skipped', previewStatus: 'updated', sourcePath: 'note.md'
  })]);

  expect(openDatabaseConnection().driver.queryAll(
    `SELECT source_fingerprint FROM import_sources
     WHERE watched_binding_id = ? AND watched_relative_path = 'note.md'`, [binding.binding_id]
  )).toEqual([{ source_fingerprint: first.source_fingerprint }]);
  expect(openDatabaseConnection().driver.queryOne(
    'SELECT id, content FROM nodes WHERE id = ?', [first.latest_node_id]
  )).toEqual({ content: '# Original\nFirst body', id: first.latest_node_id });
});
