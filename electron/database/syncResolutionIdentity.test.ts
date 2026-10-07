// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_cache_dir: path.join(mockedAppDataDir, 'cache'),
  app_config_dir: path.join(mockedAppDataDir, 'config'),
  app_data_dir: mockedAppDataDir,
  app_log_dir: path.join(mockedAppDataDir, 'logs')
}) }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { applyCompanionSyncPushAsync } from './companionSyncPushAsyncApply.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let root = '';
afterEach(async () => {
  closeDatabaseConnection();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

function open(name: string) {
  closeDatabaseConnection();
  mockedAppDataDir = path.join(root, name);
  const connection = openDatabaseConnection();
  initializeDatabaseConnection(connection);
  return createBetterSqliteDbPort(connection.sqlite);
}

function branch(version: string, title: string): NativeSyncNodeRecord {
  const time = '2026-09-20T00:00:00.000Z';
  return {
    ancestor_version_ids: [], body_text: `Body ${version}`, content_hash: `hash-${version}`,
    host_name: version, object_id: 'topic', object_type: 'node',
    parent_version_id: null, parent_version_ids: [], updated_at: time,
    version_created_at: time, version_id: version,
    snapshot: {
      anchor_link: null, attachments: [], content: `Body ${version}`, created_at: time,
      deleted_at: null, desired_retention: null, hide_title_heading: false, id: 'topic',
      image_regions: null, is_title_manual: true, kind: 'topic', opening_text: null,
      parent_id: null, position: null, priority: null, reveal: null, title,
      updated_at: time, virtual_filter: null
    }
  };
}

async function push(record: NativeSyncNodeRecord) {
  const result = await applyCompanionSyncPushAsync([{
    authorHostName: record.host_name!,
    base: { ancestorVersionIds: record.ancestor_version_ids, kind: 'node_version',
      parentVersionId: record.parent_version_id, parentVersionIds: record.parent_version_ids! },
    clientOpId: `node:${record.version_id}`, contentHash: record.content_hash!,
    identity: { objectId: record.object_id, objectType: 'node', scope: 'workspace' },
    payloadJson: JSON.stringify(record), updatedAt: record.updated_at
  }], record.host_name!);
  expect(result.acks).toMatchObject([{ status: 'accepted' }]);
  return (await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(openDatabaseConnection().sqlite), 'topic'))!;
}

async function resolve(name: string, local: NativeSyncNodeRecord, incoming: NativeSyncNodeRecord) {
  const port = open(name);
  await applySyncNodesWithDbPort(port, [local]);
  await retainLocalEditBase(port, { holdId: `draft-${name}`, nodeId: 'topic', versionId: local.version_id! });
  // An existing local annotation favors the local head when no common body is available.
  await port.run(`INSERT INTO nodes
    (id, kind, title, parent_id, anchor_link, anchor_resolution_status, anchor_source_version_id, created_at, updated_at)
    VALUES (?, 'note', 'Note', 'topic', 'anchor', 'resolved', ?, ?, ?)`,
  [`note-${name}`, local.version_id, local.updated_at, local.updated_at]);
  const resolution = await push(incoming);
  await retainLocalEditBase(port, { holdId: `result-${name}`, nodeId: 'topic', versionId: resolution.version_id! });
  return resolution;
}

it('resolves incomparable bases in one exchange while preserving both bodies after restart and replay', async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-resolution-identity-'));
  const a = branch('branch-a', 'Title A');
  const b = branch('branch-b', 'Title B');
  const left = await resolve('left', a, b);
  const right = await resolve('right', b, a);
  expect(left.snapshot.title).toBe('Title A');
  expect(right.snapshot.title).toBe('Title B');
  expect(left.content_hash).not.toBe(right.content_hash);
  expect(left.version_id).not.toBe(right.version_id);
  // Main selection is comparable only once both devices know the same child associations.
  for (const [name, other, version] of [['left', 'right', b], ['right', 'left', a]] as const) {
    await open(name).run(`INSERT INTO nodes
      (id, kind, title, parent_id, anchor_source_version_id, created_at, updated_at)
      VALUES (?, 'note', 'Note', 'topic', ?, ?, ?)`,
    [`note-${other}`, version.version_id, version.updated_at, version.updated_at]);
  }
  open('left');
  const finalLeft = await push(right);
  open('right');
  const finalRight = await push(left);
  expect(finalLeft.version_id).toBe(finalRight.version_id);
  expect(finalLeft.content_hash).toBe(finalRight.content_hash);
  expect(finalLeft.snapshot).toEqual(finalRight.snapshot);
  expect(new Set(finalLeft.parent_version_ids)).toEqual(new Set([left.version_id, right.version_id]));
  for (const name of ['left', 'right']) {
    const port = open(name);
    const reopened = (await loadCurrentSyncNodeRecord(port, 'topic'))!;
    expect(reopened.version_id).toBe(finalRight.version_id);
    expect(new Set([reopened.body_text, ...reopened.alternative_bodies?.map((row) => row.text) ?? []]))
      .toEqual(new Set([a.body_text, b.body_text]));
    const [before] = await port.query<{ count: number }>('SELECT COUNT(*) AS count FROM node_sync_versions');
    expect((await push(left)).version_id).toBe(finalRight.version_id);
    expect((await push(right)).version_id).toBe(finalRight.version_id);
    const [after] = await port.query<{ count: number }>('SELECT COUNT(*) AS count FROM node_sync_versions');
    expect(after).toEqual(before);
  }
});
