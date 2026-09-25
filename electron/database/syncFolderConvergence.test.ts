// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-folder-convergence-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-folder-convergence-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('keeps independent virtual-folder additions and a rename from both branches', async () => {
  const base = virtualFolderSnapshot({ manual_child_order: '["a"]', title: 'Base' });
  const local = virtualFolderSnapshot({ manual_child_order: '["a","b"]', title: 'Renamed' });
  const remote = virtualFolderSnapshot({ manual_child_order: '["a","c"]', title: 'Base' });
  seedFolder(base, local);

  const result = await applyIncoming(remote);
  const row = readFolder();

  expect(result.handledConflictCount).toBe(1);
  expect(row.title).toBe('Renamed');
  expect(JSON.parse(row.manual_child_order!)).toEqual(['a', 'c', 'b']);
  expect(readResolutionParents(row.current_version_id)).toEqual(['local', 'remote']);
});

it('keeps independent removals without resurrecting either virtual member', async () => {
  const base = virtualFolderSnapshot({ manual_child_order: '["a","b","c"]' });
  seedFolder(base, virtualFolderSnapshot({ manual_child_order: '["a","c"]' }));

  await applyIncoming(virtualFolderSnapshot({ manual_child_order: '["a","b"]' }));

  expect(JSON.parse(readFolder().manual_child_order!)).toEqual(['a']);
});

it('uses the later folder deletion while retaining its child node', async () => {
  const base = folderSnapshot();
  seedFolder(base, folderSnapshot({ title: 'Renamed' }));
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
     VALUES ('child', 'folder', 'topic', 'Child', 'Text', ?, ?)`,
    ['2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z']
  );

  await applyIncoming(folderSnapshot({ deleted_at: '2026-09-25T03:00:00.000Z' }));

  expect(readFolder().deleted_at).toBe('2026-09-25T03:00:00.000Z');
  expect(driver.queryOne("SELECT id, content FROM nodes WHERE id = 'child'")).toEqual({
    id: 'child', content: 'Text'
  });
});

it('keeps a topic body edit while the later move chooses its single parent folder', async () => {
  const driver = openDatabaseConnection().driver;
  for (const parent of ['left-parent', 'right-parent']) {
    driver.execute(
      `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
       VALUES (?, 'folder', ?, '', ?, ?)`,
      [parent, parent, '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z']
    );
  }
  const base = folderSnapshot({ id: 'article', kind: 'topic', parent_id: null, content: 'Base' });
  const local = { ...base, content: 'Base local', parent_id: 'left-parent' };
  const remote = { ...base, parent_id: 'right-parent' };
  driver.execute(
    `INSERT INTO nodes (id, parent_id, kind, title, content, current_version_id,
       created_at, updated_at)
     VALUES ('article', 'left-parent', 'topic', 'Article', 'Base local', 'article-local', ?, ?)`,
    [base.created_at, base.updated_at]
  );
  for (const [id, parent, time, snapshot] of [
    ['article-base', null, '2026-09-25T01:00:00.000Z', base],
    ['article-local', 'article-base', '2026-09-25T02:00:00.000Z', local]
  ] as const) {
    driver.execute(
      `INSERT INTO node_sync_versions
       (version_id, object_id, parent_version_id, host_name, created_at,
        content_hash, body_text, snapshot_json)
       VALUES (?, 'article', ?, 'Mac', ?, ?, ?, ?)`,
      [id, parent, time, id, snapshot.content ?? '', JSON.stringify(snapshot)]
    );
  }
  const record: NativeSyncNodeRecord = {
    ancestor_version_ids: ['article-base'], body_text: 'Base', content_hash: 'article-remote',
    host_name: 'Windows', object_id: 'article', object_type: 'node',
    parent_version_id: 'article-base', parent_version_ids: ['article-base'], snapshot: remote,
    updated_at: remote.updated_at, version_created_at: '2026-09-25T03:00:00.000Z',
    version_id: 'article-remote'
  };
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'topic-move' });

  await applyConvergentSyncNodesWithDbPort(port, [record]);

  expect(driver.queryOne('SELECT parent_id, content FROM nodes WHERE id = ?', ['article']))
    .toEqual({ parent_id: 'right-parent', content: 'Base local' });
});

it('restores a deleted folder when a later operation adds a new child', async () => {
  const base = folderSnapshot();
  seedFolder(base, folderSnapshot({ deleted_at: '2026-09-25T02:00:00.000Z' }));
  const child = folderSnapshot({
    id: 'new-child', kind: 'topic', parent_id: 'folder', content: 'New article',
    created_at: '2026-09-25T03:00:00.000Z'
  });
  const record: NativeSyncNodeRecord = {
    ancestor_version_ids: [], body_text: 'New article', content_hash: 'new-child',
    host_name: 'Windows', object_id: 'new-child', object_type: 'node',
    parent_version_id: null, parent_version_ids: [], snapshot: child,
    updated_at: child.created_at, version_created_at: child.created_at,
    version_id: 'new-child-version'
  };
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'later-child' });

  await applyConvergentSyncNodesWithDbPort(port, [record]);

  expect(readFolder().deleted_at).toBeNull();
  expect(openDatabaseConnection().driver.queryOne("SELECT parent_id FROM nodes WHERE id = 'new-child'"))
    .toEqual({ parent_id: 'folder' });
});

type Snapshot = NativeSyncNodeRecord['snapshot'];

function folderSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    anchor_link: null, attachments: [], content: '',
    created_at: '2026-09-25T00:00:00.000Z', deleted_at: null,
    desired_retention: null, hide_title_heading: false, id: 'folder',
    image_regions: null, is_title_manual: true, kind: 'folder',
    manual_child_order: null, opening_text: null, parent_id: null,
    position: 1, priority: null, reveal: null, title: 'Base',
    updated_at: '2026-09-25T00:00:00.000Z', virtual_filter: null,
    ...overrides
  };
}

function virtualFolderSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return folderSnapshot({
    parent_id: 'special-virtual-root',
    virtual_filter: '{"conditions":[{"field":"manual","operator":"equals","value":"manual-child-order"}],"match":"all","version":1}',
    ...overrides
  });
}

function seedFolder(base: Snapshot, local: Snapshot) {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT OR IGNORE INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('special-virtual-root', 'folder', 'Virtual', '', ?, ?)`,
    [base.created_at, base.created_at]
  );
  driver.execute(
    `INSERT INTO nodes (id, parent_id, kind, title, content, manual_child_order, deleted_at,
       current_version_id, sync_dirty, created_at, updated_at)
     VALUES ('folder', ?, 'folder', ?, '', ?, ?, 'local', 0, ?, ?)`,
    [local.parent_id, local.title, local.manual_child_order ?? null,
      local.deleted_at, local.created_at, local.updated_at]
  );
  for (const [id, parent, time, snapshot] of [
    ['base', null, '2026-09-25T01:00:00.000Z', base],
    ['local', 'base', '2026-09-25T02:00:00.000Z', local]
  ] as const) {
    driver.execute(
      `INSERT INTO node_sync_versions
       (version_id, object_id, parent_version_id, host_name, created_at,
        content_hash, body_text, snapshot_json)
       VALUES (?, 'folder', ?, 'Mac', ?, ?, '', ?)`,
      [id, parent, time, id, JSON.stringify(snapshot)]
    );
  }
}

function applyIncoming(snapshot: Snapshot) {
  const record: NativeSyncNodeRecord = {
    ancestor_version_ids: ['base'], body_text: '', content_hash: 'remote',
    host_name: 'Windows', object_id: 'folder', object_type: 'node',
    parent_version_id: 'base', parent_version_ids: ['base'], snapshot,
    updated_at: snapshot.updated_at, version_created_at: '2026-09-25T03:00:00.000Z',
    version_id: 'remote'
  };
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'folder-convergence' });
  return applyConvergentSyncNodesWithDbPort(port, [record]);
}

function readFolder() {
  return openDatabaseConnection().driver.queryOne<{
    current_version_id: string; deleted_at: string | null; manual_child_order: string | null; title: string;
  }>("SELECT current_version_id, deleted_at, manual_child_order, title FROM nodes WHERE id = 'folder'")!;
}

function readResolutionParents(versionId: string) {
  return openDatabaseConnection().driver.queryAll<{ parent_version_id: string }>(
    'SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ? ORDER BY ordinal',
    [versionId]
  ).map((row) => row.parent_version_id);
}
