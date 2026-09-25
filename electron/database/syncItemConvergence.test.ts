// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-item-convergence-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-item-convergence-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('keeps a local item move and a remote image-source update from one fork', async () => {
  const driver = openDatabaseConnection().driver;
  const base = snapshot({ position: 1 });
  const local = snapshot({ position: 2 });
  const remote = snapshot({ image_sources: '{"cover":"https://example.com/cover.png"}', position: 1 });
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, image_sources, position, current_version_id,
       sync_dirty, created_at, updated_at)
     VALUES ('item', 'item', 'Item', 'Body', NULL, 2, 'local', 0, ?, ?)`,
    [base.created_at, base.updated_at]
  );
  for (const [id, parent, time, state] of [
    ['base', null, '2026-09-25T01:00:00.000Z', base],
    ['local', 'base', '2026-09-25T02:00:00.000Z', local]
  ] as const) {
    driver.execute(
      `INSERT INTO node_sync_versions
       (version_id, object_id, parent_version_id, host_name, created_at,
        content_hash, body_text, snapshot_json)
       VALUES (?, 'item', ?, 'Mac', ?, ?, 'Body', ?)`,
      [id, parent, time, id, JSON.stringify(state)]
    );
  }
  const record: NativeSyncNodeRecord = {
    ancestor_version_ids: ['base'], body_text: 'Body', content_hash: 'remote',
    host_name: 'Windows', object_id: 'item', object_type: 'node',
    parent_version_id: 'base', parent_version_ids: ['base'], snapshot: remote,
    updated_at: remote.updated_at, version_created_at: '2026-09-25T03:00:00.000Z',
    version_id: 'remote'
  };
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'item-fork' });

  const result = await applyConvergentSyncNodesWithDbPort(port, [record]);

  expect(result.handledConflictCount).toBe(1);
  const row = driver.queryOne<{ current_version_id: string; image_sources: string; position: number }>(
    "SELECT current_version_id, image_sources, position FROM nodes WHERE id = 'item'"
  )!;
  expect(row).toMatchObject({ image_sources: remote.image_sources, position: 2 });
  expect(driver.queryAll(
    'SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ? ORDER BY parent_version_id',
    [row.current_version_id]
  )).toEqual([{ parent_version_id: 'local' }, { parent_version_id: 'remote' }]);
});

function snapshot(overrides: Partial<NativeSyncNodeRecord['snapshot']>): NativeSyncNodeRecord['snapshot'] {
  return {
    anchor_link: null, attachments: [], content: 'Body',
    created_at: '2026-09-25T00:00:00.000Z', deleted_at: null,
    desired_retention: null, hide_title_heading: false, id: 'item',
    image_regions: null, image_sources: null, is_title_manual: true, kind: 'item',
    opening_text: null, parent_id: null, position: 1,
    priority: null, reveal: null, title: 'Item',
    updated_at: '2026-09-25T00:00:00.000Z', virtual_filter: null,
    ...overrides
  };
}
