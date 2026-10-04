// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { syncIdentityFingerprint } from '../../lib/core/sync/syncIdentityDigest.js';
import { buildSyncIdentityPackPage } from '../../lib/core/sync/syncIdentityPackPage.js';

import { openDatabaseConnection } from './connection.js';
import { loadSyncIdentityPackRows } from './syncIdentityPackRows.js';
import {
  insertNodeSyncState, mockedSyncPackBuilderAppDataDir, setupSyncPackBuilderTestLifecycle
} from './syncPackBuilderTestSupport.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));

setupSyncPackBuilderTestLifecycle();

it('loads one named node and its retained version without the unrelated setting', () => {
  insertNodeSyncState();
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO review_log
    (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
     due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after)
    VALUES ('review-1', 'op-1', 'source', 'node-1', 3, 'ts-fsrs@4', 't2',
      't1', 1, 2, 't3', 3, 4)`);
  const state = driver.queryOne<{
    object_type: string; object_id: string; content_hash: string;
    current_version_id: string | null; deleted_at: string | null;
  }>(`SELECT object_type, object_id, content_hash, current_version_id, deleted_at
    FROM sync_object_state WHERE object_type = 'node' AND object_id = 'node-1'`)!;
  const page = buildSyncIdentityPackPage({
    group_id: 'group', source_peer_id: 'source', target_peer_id: 'target',
    source_view_id: '12345678-1234-1234-1234-123456789abc',
    page_index: 0, previous_page_id: null,
    objects: [{ object_type: state.object_type, object_id: state.object_id,
      fingerprint: syncIdentityFingerprint(state) }]
  });
  const rows = loadSyncIdentityPackRows(driver, page);
  expect(rows.stateRows.map((row) => row.object_id)).toEqual(['node-1']);
  expect(rows.stateRows.map((row) => row.state_seq)).toEqual([0]);
  expect(rows.nodes.map((row) => row.id)).toEqual(['node-1']);
  expect(rows.nodeVersions.map((row) => row.version_id)).toEqual(['desktop#node-1-v1']);
  expect(rows.reviewLog.map((row) => row.op_id)).toEqual(['op-1']);
  expect(rows.syncObjects).toEqual([]);
  expect(rows).not.toHaveProperty('consumedStateSeq');
  expect(() => loadSyncIdentityPackRows(driver, page, undefined,
    { applyRows: 128, databaseBytes: 1, transferBytes: 1024 }))
    .toThrow('sync_identity_pack_page_over_budget');
});
