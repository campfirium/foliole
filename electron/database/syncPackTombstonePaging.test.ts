// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { applyRemoteNodeTombstone } from '../../lib/core/sync/syncNodeTombstoneApply.js';

import { openDatabaseConnection } from './connection.js';
import { backfillMissingNodeSyncState } from './nodeSyncStateRows.js';
import { mockedRequestProjectionAppDataDir, ownerPort, projectionPeer,
  setupRequestProjection, transferProjection } from './requestProjection.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedRequestProjectionAppDataDir,
  app_cache_dir: path.join(mockedRequestProjectionAppDataDir, 'cache'),
  app_config_dir: path.join(mockedRequestProjectionAppDataDir, 'config'),
  app_log_dir: path.join(mockedRequestProjectionAppDataDir, 'logs')
}) }));
setupRequestProjection();

it('preserves six original deletion facts through current requests, replay and reopen without reviving nodes', async () => {
  const source = openDatabaseConnection().sqlite;
  const deletedAt = '2026-09-28T00:00:00.000Z';
  const expected = [];
  for (let index = 0; index < 6; index++) {
    const nodeId = `deleted-${index}`;
    const deleted = { ...textBranch(`v-${index}`, '', undefined, deletedAt), is_tombstone: true };
    deleted.object_id = nodeId; deleted.snapshot.id = nodeId;
    deleted.snapshot.deleted_at = deletedAt; deleted.host_name = 'source';
    deleted.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(deleted.snapshot), content: '' });
    await applyRemoteNodeTombstone(ownerPort(), deleted, false);
    expected.push({ node_id: nodeId, version_id: `v-${index}`, parent_version_id: null,
      host_name: 'source', content_hash: deleted.content_hash, deleted_at: deletedAt, created_at: deletedAt });
  }
  const original = source.prepare('SELECT * FROM node_sync_tombstones ORDER BY node_id').all();
  const target = projectionPeer('target');
  for (let replay = 0; replay < 2; replay++) {
    await transferProjection(ownerPort(), target.db);
    target.reopen();
    expect(target.sqlite.prepare(`SELECT node_id, version_id, parent_version_id, host_name, content_hash,
      deleted_at, created_at FROM node_sync_tombstones ORDER BY node_id`).all()).toEqual(expected);
    expect(target.sqlite.prepare('SELECT * FROM nodes').all()).toEqual([]);
    expect(target.sqlite.prepare(`SELECT version_id, object_id, parent_version_id, host_name, content_hash, body_text
      FROM node_sync_versions ORDER BY object_id`).all()).toEqual(expected.map(value => ({
      version_id: value.version_id, object_id: value.node_id, parent_version_id: null,
      host_name: value.host_name, content_hash: value.content_hash, body_text: null
    })));
    expect(target.sqlite.prepare('SELECT * FROM node_sync_version_parents').all()).toEqual([]);
    expect(source.prepare('SELECT * FROM node_sync_tombstones ORDER BY node_id').all()).toEqual(original);
  }
});

it('backfills old node states in fixed batches without retaining page-only IDs', () => {
  const { sqlite, driver } = openDatabaseConnection();
  const insert = sqlite.transaction(() => {
    for (let index = 0; index < 260; index++) {
      sqlite.prepare(`INSERT INTO nodes (id, kind, title, content, current_version_id,
        created_at, updated_at) VALUES (?, 'topic', 'Title', '', ?, 'now', 'now')`)
        .run(`node-${index}`, `version-${index}`);
      sqlite.prepare(`INSERT INTO node_sync_versions (version_id, object_id, host_name,
        created_at, content_hash, snapshot_json) VALUES (?, ?, 'source', 'now', 'hash', '{}')`)
        .run(`version-${index}`, `node-${index}`);
    }
  });
  insert();
  expect(backfillMissingNodeSyncState(driver, false)).toEqual([]);
  expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM sync_object_state
    WHERE object_type = 'node'`).get()).toMatchObject({ count: 260 });
  expect(backfillMissingNodeSyncState(driver)).toEqual([]);
});


it('preserves known states and backfills only valid missing heads with their deletion metadata', () => {
  const { sqlite, driver } = openDatabaseConnection();
  for (const id of ['known', 'removed', 'missing-version']) {
    sqlite.prepare(`INSERT INTO nodes
      (id, kind, title, current_version_id, last_modified_by_host_name, deleted_at, created_at, updated_at)
      VALUES (?, 'topic', 'Node', ?, 'editor', ?, 'now', 'later')`)
      .run(id, `v-${id}`, id === 'removed' ? 'deleted-time' : null);
    if (id !== 'missing-version') sqlite.prepare(`INSERT INTO node_sync_versions
      (version_id, object_id, host_name, created_at, content_hash, snapshot_json)
      VALUES (?, ?, 'author', 'now', ?, '{}')`).run(`v-${id}`, id, `hash-${id}`);
  }
  sqlite.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('node', 'known', 7, 'kept-hash', 'kept-host', 'kept-time', 1)`).run();
  sqlite.prepare('UPDATE sync_state_sequence SET high_water=7 WHERE singleton_id=1').run();
  const known = sqlite.prepare("SELECT * FROM sync_object_state WHERE object_id='known'").get();
  expect(backfillMissingNodeSyncState(driver)).toEqual(['removed']);
  expect(sqlite.prepare("SELECT * FROM sync_object_state WHERE object_id='known'").get()).toEqual(known);
  expect(sqlite.prepare("SELECT * FROM sync_object_state WHERE object_id='removed'").get())
    .toMatchObject({ state_seq: 8, current_version_id: 'v-removed', content_hash: 'hash-removed',
      last_modified_by_host_name: 'editor', updated_at: 'later', deleted_at: 'deleted-time', sync_dirty: 0 });
  expect(sqlite.prepare("SELECT * FROM sync_object_state WHERE object_id='missing-version'").get())
    .toBeUndefined();
  expect(backfillMissingNodeSyncState(driver)).toEqual([]);
  expect(sqlite.prepare('SELECT high_water FROM sync_state_sequence WHERE singleton_id=1').get())
    .toEqual({ high_water: 8 });
});
