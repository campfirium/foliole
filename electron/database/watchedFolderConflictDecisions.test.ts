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

import { previewWatchedFolderReconnect } from '../import/watchedFolderReconnect.js';
import { applyWatchedPreparedImportIdentity } from '../import/watchedPreparedImportIdentity.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { resolveDesktopSourceAddress } from './desktopSources.js';
import { initializeDatabase } from './migrate.js';
import { previewSourceManagement } from './sourceManagement.js';
import { recordWatchedImportSourceMapping, resolveExecutableWatchedBinding,
  upsertChangedWatchedFolderSource } from './watchedFolderBindings.js';
import {
  applyRemoteWatchedFolderConflictDecisions,
  loadPendingWatchedFolderConflicts,
  saveWatchedFolderConflictDecision
} from './watchedFolderConflictDecisions.js';
import { applyRemoteWatchedFolderGroupSources } from './watchedFolderGroupSources.js';
import { resolveWatchedHistoricalSourceRef } from './watchedHistoricalSourceMapping.js';

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

async function conflictingSources(localRule = 'draft-import-source-101',
  remoteRule = 'draft-import-source-102') {
  const folder = path.join(root, 'articles');
  await fs.mkdir(folder);
  await fs.writeFile(path.join(folder, 'note.md'), '# Note');
  const local = upsertChangedWatchedFolderSource({
    actionMode: 'keep', archivePath: '', highlightMode: 'merged', highlightPath: '',
    id: localRule, keepPreview: null, keepState: 'enabled', primaryPath: folder
  }, '2026-09-26T00:00:00.000Z')!;
  applyRemoteWatchedFolderGroupSources([{
    action_mode: 'keep', binding_id: 'remote-binding', connection_status: 'connected',
    created_at: '2026-09-26T00:00:00.000Z', highlight_mode: 'merged',
    host_name: 'Windows', host_platform: 'win32', legacy_rule_id: remoteRule,
    owner_device_identity_key: 'remote-device', reported_path: folder,
    source_ref: 'watched:remote-binding', updated_at: '2026-09-26T00:00:00.000Z'
  }], 'remote-device');
  return { folder, local, conflict: loadPendingWatchedFolderConflicts()[0]! };
}

it('runs only the selected same-path watcher immediately and preserves both sources', async () => {
  const { folder, local, conflict } = await conflictingSources();
  expect(resolveExecutableWatchedBinding('draft-import-source-101', folder).executable).toBe(false);
  const decision = saveWatchedFolderConflictDecision(conflict.conflict_key, [local.binding_id]);
  expect(loadPendingWatchedFolderConflicts()).toEqual([]);
  expect(resolveExecutableWatchedBinding('draft-import-source-101', folder).executable).toBe(true);
  expect(decision.source_alias_refs).toEqual([
    'watched:draft-import-source-101', 'watched:draft-import-source-102', 'watched:remote-binding'
  ]);
  applyRemoteWatchedFolderConflictDecisions([{
    ...decision, decided_at: '2026-09-25T00:00:00.000Z',
    decided_by_device_identity_key: 'remote-device', decision_id: 'earlier',
    selected_binding_ids: ['remote-binding']
  }]);
  expect(resolveExecutableWatchedBinding('draft-import-source-101', folder).executable).toBe(false);
  expect(openDatabaseConnection().driver.queryOne(
    'SELECT binding_id FROM watched_folder_bindings WHERE binding_id = ?', [local.binding_id]
  )).toEqual({ binding_id: local.binding_id });
});

it('resolves old articles through the chosen source without rewriting import history', async () => {
  const { folder, local, conflict } = await conflictingSources();
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO import_sources (source_fingerprint, provider, source_kind,
    source_name, source_locator, first_imported_at, last_imported_at,
    last_content_fingerprint, latest_node_id, source_ref, source_location)
    VALUES ('old-fingerprint', 'markdown', 'file', 'note.md', ?, 'now', 'now',
      'content-hash', 'old-node', 'watched:draft-import-source-101', 'note.md')`,
  [path.join(folder, 'note.md')]);
  const before = driver.queryOne('SELECT * FROM import_sources WHERE source_fingerprint = ?',
    ['old-fingerprint']);
  saveWatchedFolderConflictDecision(conflict.conflict_key, [local.binding_id]);
  expect(resolveWatchedHistoricalSourceRef('watched:draft-import-source-101'))
    .toBe(local.source_ref);
  expect(resolveDesktopSourceAddress('watched:draft-import-source-101', 'note.md'))
    .toBe(path.join(folder, 'note.md'));
  const prepared = applyWatchedPreparedImportIdentity(
    { ruleId: 'draft-import-source-101', directoryPath: folder, sourceType: 'generic' } as
      Parameters<typeof applyWatchedPreparedImportIdentity>[0],
    { sourceName: 'note.md' } as Parameters<typeof applyWatchedPreparedImportIdentity>[1],
    { sourceFingerprint: 'new-fingerprint' } as Parameters<typeof applyWatchedPreparedImportIdentity>[2]
  );
  expect(prepared.sourceFingerprint).toBe('old-fingerprint');
  recordWatchedImportSourceMapping({ directoryPath: folder, relativePath: 'note.md',
    ruleId: 'draft-import-source-101', sourceFingerprint: 'old-fingerprint', updatedAt: 'later' });
  expect(previewSourceManagement({ action: 'remove_source', sourceRef: local.source_ref })
    .topic_count).toBe(1);
  await expect(previewWatchedFolderReconnect(local.binding_id, folder)).resolves.toMatchObject({
    matched_count: 1, new_count: 0
  });
  expect(driver.queryOne('SELECT * FROM import_sources WHERE source_fingerprint = ?',
    ['old-fingerprint'])).toEqual(before);
});

it('keeps the source mapping after the original path and rule metadata change', async () => {
  const { local, conflict } = await conflictingSources();
  saveWatchedFolderConflictDecision(conflict.conflict_key, [local.binding_id]);
  const driver = openDatabaseConnection().driver;
  driver.execute(`UPDATE watched_folder_bindings SET reported_path = '/moved', local_rule_id = NULL
    WHERE binding_id = ?`, [local.binding_id]);
  expect(loadPendingWatchedFolderConflicts()).toEqual([]);
  expect(resolveWatchedHistoricalSourceRef('watched:draft-import-source-101'))
    .toBe(local.source_ref);
});

it('points an unselected device source at the selected source without editing its article', async () => {
  const { local, conflict } = await conflictingSources();
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO import_sources (source_fingerprint, provider, source_kind,
    source_name, source_locator, first_imported_at, last_imported_at,
    last_content_fingerprint, latest_node_id, source_ref, source_location)
    VALUES ('remote-old', 'markdown', 'file', 'note.md', '/old/note.md', 'now', 'now',
      'hash', 'remote-node', 'watched:remote-binding', 'note.md')`);
  saveWatchedFolderConflictDecision(conflict.conflict_key, [local.binding_id]);
  expect(resolveWatchedHistoricalSourceRef('watched:remote-binding')).toBe(local.source_ref);
  expect(previewSourceManagement({ action: 'remove_source', sourceRef: local.source_ref })
    .topic_count).toBe(1);
  expect(previewSourceManagement({ action: 'remove_source', sourceRef: 'watched:remote-binding' })
    .topic_count).toBe(0);
  expect(driver.queryOne(`SELECT source_ref, latest_node_id FROM import_sources
    WHERE source_fingerprint = 'remote-old'`)).toEqual({
    source_ref: 'watched:remote-binding', latest_node_id: 'remote-node'
  });
});
