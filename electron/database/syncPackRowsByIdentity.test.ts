// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

let root = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_cache_dir: path.join(root, 'cache'), app_config_dir: path.join(root, 'config'),
  app_data_dir: root, app_log_dir: path.join(root, 'logs')
}) }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { syncIdentityFingerprint } from '../../lib/core/sync/syncIdentityDigest.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { loadPackRowsByIdentity } from './syncPackRowsByIdentity.js';

afterEach(async () => {
  closeDatabaseConnection();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

it('packs only named global identities regardless of local sequence order', async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-pack-ids-'));
  initializeDatabaseConnection(openDatabaseConnection());
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('older', 'topic', 'Older', '', 'now', 'now'),
      ('wanted', 'topic', 'Wanted', '', 'now', 'now'),
      ('newer', 'topic', 'Newer', '', 'now', 'now')`);
  driver.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
    VALUES ('node', 'older', 1, 'old', 'source', 'now'),
      ('node', 'wanted', 9, 'wanted', 'source', 'now'),
      ('node', 'newer', 200, 'new', 'source', 'now')`);
  const identity = { object_type: 'node', object_id: 'wanted', fingerprint: syncIdentityFingerprint({
    object_type: 'node', object_id: 'wanted', content_hash: 'wanted',
    current_version_id: null, deleted_at: null
  }) };
  const rows = loadPackRowsByIdentity(driver, [identity]);
  expect(rows.stateRows.map((row) => row.object_id)).toEqual(['wanted']);
  expect(rows.nodes.map((row) => row.id)).toEqual(['wanted']);
  expect(rows).not.toHaveProperty('consumedStateSeq');
  expect(() => loadPackRowsByIdentity(driver, [
    identity,
    { ...identity, object_id: 'missing' }
  ])).toThrow('sync_pack_identity_source_changed');
  expect(() => loadPackRowsByIdentity(driver, [{ ...identity, fingerprint: '0'.repeat(64) }]))
    .toThrow('sync_pack_identity_source_changed');
});
