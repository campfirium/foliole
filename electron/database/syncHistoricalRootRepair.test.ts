// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-historical-root-repair-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-historical-root-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('fast-forwards a folder when its local root matches an incoming ancestor by content', async () => {
  seedHistoricalRoots('same-root-hash', 0);

  const result = await applyIncomingFolder();

  expect(result).toMatchObject({ appliedNodeCount: 1, handledConflictCount: 0 });
  expect(readCurrentNode()).toEqual({
    content: 'Current remote body',
    current_version_id: 'remote-head',
    title: 'Current remote folder'
  });
  expect(openDatabaseConnection().driver.queryOne(
    `SELECT content_hash FROM node_sync_versions WHERE version_id = 'local-root'`
  )).toEqual({ content_hash: 'same-root-hash' });
});

it('automatically resolves independent folder histories using the later operation', async () => {
  seedHistoricalRoots('different-local-hash', 0);

  const result = await applyIncomingFolder();

  expect(result.handledConflictCount).toBe(1);
  expect(readCurrentNode()).toMatchObject({
    content: 'Current remote body',
    title: 'Current remote folder'
  });
  expect(readCurrentNode().current_version_id).not.toBe('local-root');
});

it('ignores a known older folder version after the local folder has advanced', async () => {
  seedHistoricalRoots('same-root-hash', 0);
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `UPDATE nodes SET current_version_id = 'remote-head', title = 'Current remote folder',
       content = 'Current remote body' WHERE id = 'shared-folder'`
  );
  const older = {
    ...incomingFolder(),
    ancestor_version_ids: [],
    body_text: 'Historical body',
    content_hash: 'same-root-hash',
    parent_version_id: null,
    parent_version_ids: [],
    snapshot: snapshot('Historical body', 'Historical folder', '2026-07-02T00:00:00.000Z'),
    updated_at: '2026-07-02T00:00:00.000Z',
    version_created_at: '2026-07-02T00:00:00.000Z',
    version_id: 'remote-root'
  };

  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'known-older-folder' });
  const result = await applyConvergentSyncNodesWithDbPort(port, [older]);

  expect(result.handledConflictCount).toBe(0);
  expect(readCurrentNode().current_version_id).toBe('remote-head');
});

it('ignores an older live folder version after the local folder was deleted', async () => {
  seedHistoricalRoots('same-root-hash', 0);
  const driver = openDatabaseConnection().driver;
  const deletedAt = '2026-07-04T00:00:00.000Z';
  driver.execute(
    `UPDATE nodes SET current_version_id = 'deleted-head', deleted_at = ?
     WHERE id = 'shared-folder'`,
    [deletedAt]
  );
  driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json
     ) VALUES ('deleted-head', 'shared-folder', 'remote-head', 'test-host', ?,
       'deleted-head-hash', 'Current remote body', ?)`,
    [deletedAt, JSON.stringify({ ...snapshot('Current remote body', 'Current remote folder', deletedAt), deleted_at: deletedAt })]
  );
  driver.execute(
    `INSERT INTO node_sync_version_parents (version_id, parent_version_id, ordinal)
     VALUES ('deleted-head', 'remote-head', 0)`
  );

  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'older-than-deletion' });
  const result = await applyConvergentSyncNodesWithDbPort(port, [incomingFolder()]);

  expect(result.handledConflictCount).toBe(0);
  expect(driver.queryOne(`SELECT current_version_id, deleted_at FROM nodes WHERE id = 'shared-folder'`))
    .toEqual({ current_version_id: 'deleted-head', deleted_at: deletedAt });
});

it('does not repair over an unversioned local change', async () => {
  seedHistoricalRoots('same-root-hash', 1);

  await expect(applyIncomingFolder()).rejects.toThrow('sync_folder_local_change_unversioned:shared-folder');
  expect(readCurrentNode().current_version_id).toBe('local-root');
});

function seedHistoricalRoots(localHash: string, syncDirty: number) {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO nodes (
       id, kind, title, content, current_version_id, sync_dirty, created_at, updated_at
     ) VALUES ('shared-folder', 'folder', 'Historical folder', 'Historical body',
       'local-root', ?, '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')`,
    [syncDirty]
  );
  insertVersion('local-root', null, localHash, 'Historical body', 'Historical folder', '2026-07-01T00:00:00.000Z');
  insertVersion('remote-root', null, 'same-root-hash', 'Historical body', 'Historical folder', '2026-07-02T00:00:00.000Z');
  insertVersion('remote-head', 'remote-root', 'remote-head-hash', 'Current remote body',
    'Current remote folder', '2026-07-03T00:00:00.000Z');
  driver.execute(
    `INSERT INTO node_sync_version_parents (version_id, parent_version_id, ordinal)
     VALUES ('remote-head', 'remote-root', 0)`
  );
}

function insertVersion(
  versionId: string,
  parentVersionId: string | null,
  contentHash: string,
  content: string,
  title: string,
  createdAt: string
) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json
     ) VALUES (?, 'shared-folder', ?, 'test-host', ?, ?, ?, ?)`,
    [versionId, parentVersionId, createdAt, contentHash, content,
      JSON.stringify(snapshot(content, title, createdAt))]
  );
}

function incomingFolder(): NativeSyncNodeRecord {
  const updatedAt = '2026-07-03T00:00:00.000Z';
  return {
    ancestor_version_ids: ['remote-root'],
    body_text: 'Current remote body',
    content_hash: 'remote-head-hash',
    host_name: 'remote-host',
    object_id: 'shared-folder',
    object_type: 'node',
    parent_version_id: 'remote-root',
    parent_version_ids: ['remote-root'],
    snapshot: snapshot('Current remote body', 'Current remote folder', updatedAt),
    updated_at: updatedAt,
    version_created_at: updatedAt,
    version_id: 'remote-head'
  };
}

function snapshot(content: string, title: string, updatedAt: string) {
  return {
    anchor_link: null,
    attachments: [],
    content,
    created_at: '2026-07-01T00:00:00.000Z',
    deleted_at: null,
    desired_retention: null,
    hide_title_heading: false,
    id: 'shared-folder',
    image_regions: null,
    is_title_manual: true,
    kind: 'folder' as const,
    opening_text: null,
    parent_id: null,
    position: 0,
    priority: null,
    reveal: null,
    title,
    updated_at: updatedAt,
    virtual_filter: null
  };
}

function applyIncomingFolder() {
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'historical-root-repair' });
  return applyConvergentSyncNodesWithDbPort(port, [incomingFolder()]);
}

function readCurrentNode() {
  return openDatabaseConnection().driver.queryOne<{
    content: string;
    current_version_id: string;
    title: string;
  }>(`SELECT content, current_version_id, title FROM nodes WHERE id = 'shared-folder'`)!;
}
