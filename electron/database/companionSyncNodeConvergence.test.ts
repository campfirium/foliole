// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-companion-sync-node-convergence-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { applyCompanionSyncPushAsync } from './companionSyncPushAsyncApply.js';
import type { CompanionSyncPushPayload } from './companionSyncPushTypes.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-sync-node-convergence-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function seedDivergedTopic(localBody: string) {
  const driver = openDatabaseConnection().driver;
  const baseSnapshot = JSON.stringify({
    anchor_link: null, attachments: [], content: 'A\nB\nC\n', created_at: '2026-05-03T00:00:00.000Z',
    deleted_at: null, desired_retention: null, hide_title_heading: false, id: 'topic-1', image_regions: null,
    is_title_manual: false, kind: 'topic', opening_text: null, parent_id: null, position: null, priority: null,
    reveal: null, title: 'Topic', updated_at: '2026-05-03T00:00:00.000Z', virtual_filter: null
  });
  const localSnapshot = JSON.stringify({
    ...JSON.parse(baseSnapshot), content: localBody, updated_at: '2026-05-03T01:00:00.000Z'
  });
  const rootSnapshot = JSON.stringify({
    ...JSON.parse(baseSnapshot), content: 'Earlier body', updated_at: '2026-05-02T00:00:00.000Z'
  });
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, current_version_id, created_at, updated_at)
     VALUES ('topic-1', 'topic', 'Topic', ?, 'desktop#local', '2026-05-03T00:00:00.000Z', '2026-05-03T01:00:00.000Z')`,
    [localBody]
  );
  driver.execute(
    `INSERT INTO node_sync_versions
       (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
     VALUES ('root#0', 'topic-1', NULL, 'desktop', '2026-05-02T00:00:00.000Z', 'root', 'Earlier body', ?),
       ('base#1', 'topic-1', 'root#0', 'desktop', '2026-05-03T00:00:00.000Z', 'base', 'A\nB\nC\n', ?),
       ('desktop#local', 'topic-1', 'base#1', 'desktop', '2026-05-03T01:00:00.000Z', 'local', ?, ?)`,
    [rootSnapshot, baseSnapshot, localBody, localSnapshot]
  );
  driver.execute(
    `INSERT INTO node_sync_version_parents (version_id, parent_version_id, ordinal)
     VALUES ('base#1', 'root#0', 0), ('desktop#local', 'base#1', 0)`
  );
}

function createDivergedTopicPush(body: string, versionId = 'android#branch'): CompanionSyncPushPayload {
  const updatedAt = '2026-05-03T02:00:00.000Z';
  const snapshot = {
    anchor_link: null, attachments: [], content: body, created_at: '2026-05-03T00:00:00.000Z', deleted_at: null,
    desired_retention: null, hide_title_heading: false, id: 'topic-1', image_regions: null, is_title_manual: false,
    kind: 'topic', opening_text: null, parent_id: null, position: null, priority: null, reveal: null,
    title: 'Topic', updated_at: updatedAt, virtual_filter: null
  };
  const record: NativeSyncNodeRecord = {
    ancestor_version_ids: ['base#1'], body_text: body, content_hash: `incoming:${body}`, host_name: 'android-device',
    object_id: 'topic-1', object_type: 'node', parent_version_id: 'base#1', parent_version_ids: ['base#1'],
    snapshot, updated_at: updatedAt, version_created_at: updatedAt, version_id: versionId
  };
  return {
    authorHostName: record.host_name!,
    base: { ancestorVersionIds: ['base#1'], kind: 'node_version', parentVersionId: 'base#1', parentVersionIds: ['base#1'] },
    clientOpId: `node:${versionId}`, contentHash: record.content_hash!,
    identity: { objectId: 'topic-1', objectType: 'node', scope: 'workspace' },
    payloadJson: JSON.stringify(record), updatedAt
  };
}

it('creates one multi-parent resolution for non-overlapping text edits', async () => {
  seedDivergedTopic('A1\nB\nC\n');

  const result = await applyCompanionSyncPushAsync([createDivergedTopicPush('A\nB\nC1\n')], 'android-device');
  const node = openDatabaseConnection().driver.queryOne<{ content: string; current_version_id: string; updated_at: string }>(
    `SELECT content, current_version_id, updated_at FROM nodes WHERE id = 'topic-1'`
  );

  expect(result.acks).toMatchObject([{ status: 'accepted', versionId: 'android#branch' }]);
  expect(node?.content).toBe('A1\nB\nC1\n');
  expect(node?.updated_at).toBe('2026-05-03T02:00:00.001Z');
  expect(openDatabaseConnection().driver.queryAll(
    `SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ? ORDER BY ordinal`,
    [node!.current_version_id]
  )).toEqual([{ parent_version_id: 'android#branch' }, { parent_version_id: 'desktop#local' }]);
});

it('keeps one simple alternative when overlapping text edits cannot merge', async () => {
  seedDivergedTopic('banana\nB\nC\n');

  await applyCompanionSyncPushAsync([createDivergedTopicPush('orange\nB\nC\n')], 'android-device');

  expect(openDatabaseConnection().driver.queryAll<{ body_text: string; status: string }>(
    `SELECT body_text, status FROM node_text_alternatives WHERE node_id = 'topic-1'`
  )).toEqual([{ body_text: 'banana\nB\nC\n', status: 'available' }]);
});

it('publishes the superseded alternative before its same-device replacement', async () => {
  seedDivergedTopic('banana\nB\nC\n');
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO node_text_alternatives VALUES
      ('alternative#old', 'topic-1', 'desktop#old', 'old body', 'desktop',
       '2026-05-02T03:00:00.000Z', 'available', '2026-05-02T03:00:00.000Z')`
  );
  driver.execute(
    `INSERT INTO sync_object_state
      (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
     VALUES ('node_text_alternative', 'alternative#old', 1, 'old-hash', 'desktop',
       '2026-05-02T03:00:00.000Z', 0)`
  );

  await applyCompanionSyncPushAsync([createDivergedTopicPush('orange\nB\nC\n')], 'android-device');

  expect(driver.queryAll<{ object_id: string; state_seq: number }>(
    `SELECT object_id, state_seq FROM sync_object_state WHERE object_type = 'node_text_alternative' ORDER BY state_seq`
  )).toEqual([
    { object_id: 'alternative#old', state_seq: 3 },
    { object_id: expect.stringMatching(/^alternative#/), state_seq: 4 }
  ]);
  expect(driver.queryOne<{ status: string }>(
    `SELECT status FROM node_text_alternatives WHERE alternative_id = 'alternative#old'`
  )).toEqual({ status: 'superseded' });
});

it('absorbs multiple same-request branches into one stable resolution', async () => {
  seedDivergedTopic('A1\nB\nC\n');
  const pushes = [
    createDivergedTopicPush('A\nB1\nC\n', 'android#branch-b'),
    createDivergedTopicPush('A\nB\nC1\n', 'android#branch-c')
  ];

  const first = await applyCompanionSyncPushAsync(pushes, 'android-device');
  const node = openDatabaseConnection().driver.queryOne<{ content: string; current_version_id: string }>(
    `SELECT content, current_version_id FROM nodes WHERE id = 'topic-1'`
  );
  expect(first.acks).toHaveLength(2);
  expect(node?.content).toBe('A1\nB1\nC1\n');
  expect(openDatabaseConnection().driver.queryAll(
    `SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ? ORDER BY parent_version_id`,
    [node!.current_version_id]
  )).toEqual([
    { parent_version_id: 'android#branch-b' },
    { parent_version_id: 'android#branch-c' },
    { parent_version_id: 'desktop#local' }
  ]);

  await applyCompanionSyncPushAsync(pushes, 'android-device');
  expect(node?.current_version_id).toMatch(/^ver_[a-f0-9]{24}$/);
  expect(openDatabaseConnection().driver.queryOne<{ current_version_id: string }>(
    `SELECT current_version_id FROM nodes WHERE id = 'topic-1'`
  )).toEqual({ current_version_id: node?.current_version_id });
});
