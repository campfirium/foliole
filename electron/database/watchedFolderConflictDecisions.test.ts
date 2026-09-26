// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs') })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { resolveExecutableWatchedBinding, upsertChangedWatchedFolderSource } from './watchedFolderBindings.js';
import {
  applyRemoteWatchedFolderConflictDecisions,
  loadPendingWatchedFolderConflicts,
  saveWatchedFolderConflictDecision
} from './watchedFolderConflictDecisions.js';
import { applyRemoteWatchedFolderGroupSources } from './watchedFolderGroupSources.js';

let root = '';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-watched-conflict-'));
  appDataDir = path.join(root, 'app-data');
  initializeDatabase();
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
    VALUES ('group', 'Group', 'key', 'now', 'now')`);
  driver.execute(`INSERT INTO sync_group_local_state
    (singleton_id, group_id, local_device_identity_key, state, updated_at)
    VALUES (1, 'group', 'local-device', 'active', 'now')`);
  for (const id of ['local-device', 'remote-device']) driver.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
     platform, state, joined_at, left_at, last_seen_at, updated_at)
    VALUES ('group', ?, ?, ?, ?, 'macOS', 'active', 'now', NULL, 'now', 'now')`,
  [id, `${id}-anchor`, `/library/${id}`, id]);
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('pauses only a same-path conflict and applies the saved device choice without deleting sources', async () => {
  const folder = path.join(root, 'articles');
  await fs.mkdir(folder);
  const local = upsertChangedWatchedFolderSource({
    actionMode: 'keep', archivePath: '', highlightMode: 'merged', highlightPath: '',
    id: 'local-rule', keepPreview: null, keepState: 'enabled', primaryPath: folder
  }, '2026-09-26T00:00:00.000Z')!;
  expect(resolveExecutableWatchedBinding('local-rule', folder).executable).toBe(true);

  applyRemoteWatchedFolderGroupSources([{
    action_mode: 'keep', binding_id: 'remote-binding', connection_status: 'connected',
    created_at: '2026-09-26T00:00:00.000Z', highlight_mode: 'merged',
    host_name: 'Windows', host_platform: 'win32', owner_device_identity_key: 'remote-device',
    reported_path: folder, source_ref: 'watched:remote-binding',
    updated_at: '2026-09-26T00:00:00.000Z'
  }], 'remote-device');

  const [conflict] = loadPendingWatchedFolderConflicts();
  expect(conflict?.sources.map((source) => source.binding_id)).toEqual([
    local.binding_id, 'remote-binding'
  ].sort());
  expect(resolveExecutableWatchedBinding('local-rule', folder).executable).toBe(false);
  expect(openDatabaseConnection().driver.queryOne(
    "SELECT root_path FROM desktop_sources WHERE source_ref = 'watched:remote-binding'"
  )).toEqual({ root_path: '' });
  expect(() => applyRemoteWatchedFolderGroupSources([{
    ...conflict!.sources[0], binding_id: local.binding_id,
    owner_device_identity_key: 'remote-device', source_ref: `watched:${local.binding_id}`
  }], 'remote-device')).toThrow('watched_source_identity_conflict');

  const decision = saveWatchedFolderConflictDecision(conflict!.conflict_key,
    [local.binding_id, 'remote-binding']);
  expect(loadPendingWatchedFolderConflicts()).toEqual([]);
  expect(resolveExecutableWatchedBinding('local-rule', folder).executable).toBe(true);

  applyRemoteWatchedFolderConflictDecisions([{
    ...decision, decided_at: '2026-09-25T00:00:00.000Z',
    decided_by_device_identity_key: 'remote-device', decision_id: 'earlier',
    selected_binding_ids: ['remote-binding']
  }]);
  expect(resolveExecutableWatchedBinding('local-rule', folder).executable).toBe(false);
  expect(openDatabaseConnection().driver.queryOne(
    'SELECT binding_id FROM watched_folder_bindings WHERE binding_id = ?', [local.binding_id]
  )).toEqual({ binding_id: local.binding_id });
});
