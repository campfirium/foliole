import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS as definitions } from '../../lib/core/sync/androidSyncPackProviderDefinitions.js';

import { copyPayloads } from './androidSyncPackProviderDefinitions.testSupport.js';
import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';

let root = '';
let source: Database.Database;
let sourcePath = '';

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-android-provider-contract-'));
  sourcePath = path.join(root, 'source.db');
  source = new Database(sourcePath);
  initializeDatabaseSchema(source);
  const driver = createBetterSqlite3Driver(source);
  const now = '2026-08-08T00:00:00.000Z';
  const bodyHash = upsertTextBodyBlob(driver, 'provider body', now);
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, body_blob_hash, created_at, updated_at)
     VALUES ('node-1', 'topic', 'Provider', 'provider body', ?, ?, ?)`,
    [bodyHash, now, now]
  );
  upsertSyncObjectState(driver, {
    contentHash: 'node-hash', lastModifiedByHostName: 'android-b', objectId: 'node-1', objectType: 'node', updatedAt: now
  });
  driver.execute(
    `INSERT INTO setting_records (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
     VALUES ('sample', 'host', 'android', 'phone', 'Android test host', 'true', 'setting-hash', ?)`, [now]
  );
  upsertSyncObjectState(driver, {
    contentHash: 'setting-hash', lastModifiedByHostName: 'android-b',
    objectId: 'host:android:phone:Android test host:sample', objectType: 'setting', updatedAt: now
  });
  upsertSyncObjectState(driver, {
    contentHash: 'attachment-state-hash', lastModifiedByHostName: 'android-b',
    objectId: 'attachment-1', objectType: 'attachment', updatedAt: now
  });
});

afterEach(() => {
  source.close();
  fs.rmSync(root, { force: true, recursive: true });
});

it('builds a baseline payload with structure, body manifest, and payload objects', () => {
  const pack = buildPack(0);
  expect(pack.prepare('SELECT id, content, body_blob_hash FROM nodes').get()).toMatchObject({
    content: '', id: 'node-1'
  });
  expect(pack.prepare('SELECT hash FROM content_blobs').get()).toBeTruthy();
  expect(pack.prepare("SELECT object_id FROM sync_objects WHERE object_type = 'setting'").get())
    .toEqual({ object_id: 'host:android:phone:Android test host:sample' });
  expect(pack.prepare("SELECT payload_json FROM sync_objects WHERE object_type = 'attachment'").get()).toBeUndefined();
  expect(pack.prepare("SELECT name FROM sqlite_master WHERE name IN ('attachments', 'node_attachments')").all()).toEqual([]);
  pack.close();
});

it('keeps the Android provider independent of optional SQLite JSON functions', () => {
  expect(definitions.copyStatements.join('\n')).not.toContain('json_object');
  expect(definitions.payloadPlans.map((plan) => plan.sql).join('\n')).not.toContain('json_object');
});

it('packs full ancestry with original parent order for changed nodes', () => {
  source.exec(`
    INSERT INTO node_sync_versions (
      version_id, object_id, parent_version_id, host_name, created_at,
      content_hash, body_text, snapshot_json
    ) VALUES (
      'android-b#1', 'node-1', NULL, 'android-b', '2026-08-07T00:00:00.000Z',
      'base-hash', 'base body', '{"id":"node-1","content":"base body"}'
    );
    INSERT INTO node_sync_versions (
      version_id, object_id, parent_version_id, host_name, created_at,
      content_hash, body_text, snapshot_json
    ) VALUES (
      'android-b#2', 'node-1', 'android-b#1', 'android-b', '2026-08-08T00:00:00.000Z',
      'node-hash', 'provider body', '{"id":"node-1"}'
    );
    INSERT INTO node_sync_version_parents VALUES ('android-b#2', 'android-b#1', 0);
    UPDATE nodes SET current_version_id = 'android-b#2' WHERE id = 'node-1';
  `);
  const pack = buildPack(0);
  expect(pack.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').all())
    .toEqual([{ version_id: 'android-b#1' }, { version_id: 'android-b#2' }]);
  expect(pack.prepare('SELECT * FROM node_sync_version_parents').all()).toEqual([
    { version_id: 'android-b#2', parent_version_id: 'android-b#1', ordinal: 0 }
  ]);
  pack.close();
});

it('includes only a selected nodes later ancestor state, without widening its page', () => {
  const now = '2026-08-08T00:00:00.000Z';
  source.exec(`
    INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
      VALUES ('child', 'node-1', 'topic', 'Child', '', '${now}', '${now}'),
             ('unrelated', NULL, 'topic', 'Unrelated', '', '${now}', '${now}');
    INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash,
      last_modified_by_host_name, updated_at, sync_dirty)
      VALUES ('node', 'child', 9, 'child-hash', 'android-b', '${now}', 1),
             ('node', 'unrelated', 10, 'unrelated-hash', 'android-b', '${now}', 1);
    UPDATE sync_object_state SET state_seq = 12
      WHERE object_type = 'node' AND object_id = 'node-1';
    INSERT INTO node_sync_versions (version_id, object_id, host_name, created_at,
      content_hash, body_text, snapshot_json) VALUES
      ('child-v1', 'child', 'android-b', '${now}', 'child-hash', 'child', '{}'),
      ('parent-v1', 'node-1', 'android-b', '${now}', 'parent-hash', 'parent', '{}'),
      ('unrelated-v1', 'unrelated', 'android-b', '${now}', 'unrelated-hash', 'unrelated', '{}');
  `);
  expect(source.prepare(definitions.versionPreflightSql).get(8, 9, 8, 9))
    .toMatchObject({ rows: 2 });
  const pack = buildPack(8, 9);
  expect(pack.prepare("SELECT object_id FROM sync_object_state WHERE object_type = 'node' ORDER BY object_id").all())
    .toEqual([{ object_id: 'child' }, { object_id: 'node-1' }]);
  expect(pack.prepare('SELECT id FROM nodes ORDER BY id').all())
    .toEqual([{ id: 'child' }, { id: 'node-1' }]);
  pack.close();
});

it('loads each payload surface in bulk instead of querying once per state row', () => {
  for (const plan of definitions.payloadPlans) {
    expect(plan.sql).toContain('__object_id');
    expect(plan.sql).not.toContain('?');
  }
});

it('selects an independent delta for each Device cursor', () => {
  const baseline = buildPack(0);
  const laterPeer = buildPack(2);
  expect(baseline.prepare('SELECT COUNT(*) AS value FROM sync_object_state').get()).toEqual({ value: 2 });
  expect(laterPeer.prepare('SELECT object_type, object_id FROM sync_object_state').all()).toEqual([]);
  baseline.close(); laterPeer.close();
});

it('includes a deleted-node tombstone only on its selected state page', () => {
  source.exec(`DELETE FROM nodes WHERE id = 'node-1';
    UPDATE sync_object_state SET deleted_at = '2026-08-08T00:00:00.000Z'
      WHERE object_type = 'node' AND object_id = 'node-1';
    INSERT INTO node_sync_tombstones
      (node_id, version_id, parent_version_id, host_name, content_hash,
       snapshot_json, deleted_at, created_at)
      VALUES ('node-1', 'v1', NULL, 'android-b', 'node-hash', '{}',
        '2026-08-08T00:00:00.000Z', '2026-08-08T00:00:00.000Z');`);
  const first = buildPack(0, 1);
  const second = buildPack(1, 3);
  expect(first.prepare('SELECT node_id FROM node_sync_tombstones').all()).toEqual([{ node_id: 'node-1' }]);
  expect(second.prepare('SELECT node_id FROM node_sync_tombstones').all()).toEqual([]);
  first.close(); second.close();
});

it('packs the base node required by a delta text alternative', () => {
  const now = '2026-08-08T00:01:00.000Z';
  source.exec(`
    INSERT INTO node_text_alternatives VALUES (
      'alternative-1', 'node-1', 'android-b#alternative', 'alternate body',
      'android-b', '${now}', 'available', '${now}'
    );
  `);
  source.prepare(`INSERT INTO sync_object_state (
    object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
  ) VALUES ('node_text_alternative', 'alternative-1', 4, 'alternative-hash', 'android-b', ?, 1)`
  ).run(now);

  const pack = buildPack(3, 4);
  expect(pack.prepare('SELECT object_type, object_id FROM sync_object_state').all()).toEqual([
    { object_id: 'node-1', object_type: 'node' },
    { object_id: 'alternative-1', object_type: 'node_text_alternative' }
  ]);
  expect(pack.prepare("SELECT id FROM nodes WHERE id = 'node-1'").get()).toEqual({ id: 'node-1' });
  pack.close();
});

it('projects an alternative under a deleted node as a tombstone', () => {
  const now = '2026-08-08T00:01:00.000Z';
  source.exec(`
    UPDATE nodes SET deleted_at = '${now}' WHERE id = 'node-1';
    INSERT INTO node_text_alternatives VALUES (
      'alternative-1', 'node-1', 'android-b#alternative', 'alternate body',
      'android-b', '${now}', 'available', '${now}'
    );
    INSERT INTO sync_object_state (
      object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
    ) VALUES ('node_text_alternative', 'alternative-1', 4, 'alternative-hash', 'android-b', '${now}', 1);
  `);

  const pack = buildPack(3, 4);
  expect(pack.prepare(`SELECT deleted_at FROM sync_object_state
    WHERE object_type = 'node_text_alternative'`).get()).toEqual({ deleted_at: now });
  expect(pack.prepare(`SELECT deleted_at, payload_json FROM sync_objects
    WHERE object_type = 'node_text_alternative'`).get()).toEqual({
    deleted_at: now, payload_json: null
  });
  pack.close();
});

it('shares active and left Devices without exposing the group key', () => {
  const now = '2026-08-08T00:00:00.000Z';
  source.exec(`
    INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
    VALUES ('group-1', 'Daily Group', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', '${now}', '${now}');
    INSERT INTO sync_group_local_state
      (singleton_id, group_id, local_device_identity_key, state, updated_at)
      VALUES (1, 'group-1', 'device-b', 'active', '${now}');
    INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
       platform, state, joined_at, left_at, last_seen_at, updated_at)
      VALUES
      ('group-1', 'device-b', 'anchor-b', '/data/b.db', 'Android B', 'android',
       'active', '${now}', NULL, '${now}', '${now}'),
      ('group-1', 'device-c', 'anchor-c', 'C:/data/c.db', 'Desktop C', 'windows',
       'left', '${now}', '${now}', '${now}', '${now}');
  `);
  const pack = buildPack(0);
  expect(pack.prepare('PRAGMA table_info(sync_groups)').all()).not.toContainEqual(
    expect.objectContaining({ name: 'workgroup_key' })
  );
  expect(pack.prepare('SELECT device_identity_key, state FROM sync_group_devices ORDER BY device_identity_key').all())
    .toEqual([{ device_identity_key: 'device-b', state: 'active' }, { device_identity_key: 'device-c', state: 'left' }]);
  pack.close();
});

function buildPack(fromStateSeq: number, toStateSeq = 3) {
  const pack = new Database(':memory:');
  for (const statement of definitions.packSchema) pack.exec(statement);
  pack.prepare('ATTACH DATABASE ? AS source').run(sourcePath);
  definitions.copyStatements.forEach((statement, index) => {
    if (index === definitions.stateCopyIndex) pack.prepare(statement).run(fromStateSeq, toStateSeq);
    else if (index === definitions.payloadCopyIndex) {
      copyPayloads(pack);
      pack.exec(statement);
    }
    else pack.exec(statement);
  });
  pack.exec('DETACH DATABASE source');
  return pack;
}
