// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '/tmp/foliole-sync-body-projection-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir,
    app_log_dir: path.join(appDataDir, 'logs')
  })
}));

import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertVersionedNodeSnapshot } from './nodeVersionedMutations.js';
import { reconcileVersionedInlineBodies } from './syncBodyProjectionReconcile.js';

let root = '';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-body-projection-'));
  appDataDir = path.join(root, 'data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

function createNode(id: string, content: string) {
  upsertVersionedNodeSnapshot({
    anchorLink: null, content, createdAt: '2026-09-24T00:00:00.000Z',
    isTitleManual: true, kind: 'topic', nodeId: id, parentNodeId: null,
    position: 0, reveal: null, title: id, updatedAt: '2026-09-24T00:00:00.000Z'
  });
}

it('restores a clean current-version body during automatic sync without creating a new version', () => {
  createNode('stale', 'Authoritative body');
  createNode('dirty', 'Unsaved local text');
  createNode('conflicting', 'Versioned text');
  createNode('deleted', 'Deleted body');
  const driver = openDatabaseConnection().driver;
  const before = driver.queryOne<{ current_version_id: string; updated_at: string }>(
    'SELECT current_version_id, updated_at FROM nodes WHERE id = ?', ['stale']);
  driver.execute("UPDATE nodes SET content = '', body_blob_hash = NULL WHERE id = 'stale'");
  driver.execute("UPDATE nodes SET content = '', body_blob_hash = NULL, sync_dirty = 1 WHERE id = 'dirty'");
  driver.execute("UPDATE nodes SET content = 'Local unversioned text', body_blob_hash = NULL WHERE id = 'conflicting'");
  driver.execute("UPDATE nodes SET content = '', body_blob_hash = NULL, deleted_at = '2026-09-24T00:01:00.000Z' WHERE id = 'deleted'");

  expect(reconcileVersionedInlineBodies(driver)).toBe(1);
  expect(loadNodeBodyResolution(driver, 'stale')).toMatchObject({
    content: 'Authoritative body', source: 'blob', status: 'resolved'
  });
  expect(driver.queryOne('SELECT current_version_id, updated_at FROM nodes WHERE id = ?', ['stale']))
    .toEqual(before);
  expect(loadNodeBodyResolution(driver, 'dirty')).toMatchObject({ content: '', status: 'resolved' });
  expect(loadNodeBodyResolution(driver, 'conflicting')).toMatchObject({
    content: 'Local unversioned text', status: 'resolved'
  });
  expect(loadNodeBodyResolution(driver, 'deleted')).toMatchObject({ content: '', status: 'resolved' });
  expect(reconcileVersionedInlineBodies(driver)).toBe(0);
});
