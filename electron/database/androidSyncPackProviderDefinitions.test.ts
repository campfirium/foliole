import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS as definitions } from '../../lib/core/sync/androidSyncPackProviderDefinitions.js';

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
    contentHash: 'node-hash', lastModifiedByDeviceId: 'android-b', objectId: 'node-1', objectType: 'node', updatedAt: now
  });
  driver.execute(
    `INSERT INTO setting_records (key, scope, platform, form_factor, device_id, value_json, content_hash, updated_at)
     VALUES ('sample', 'device', 'android', 'phone', '*', 'true', 'setting-hash', ?)`, [now]
  );
  upsertSyncObjectState(driver, {
    contentHash: 'setting-hash', lastModifiedByDeviceId: 'android-b',
    objectId: 'device:android:phone:*:sample', objectType: 'setting', updatedAt: now
  });
  driver.execute(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
     VALUES ('attachment-1', 'sample.pdf', 'application/pdf', 12, ?)`, [now]
  );
  driver.execute(
    `INSERT INTO attachment_blobs
       (attachment_id, content_hash, storage_key, size_bytes, mime_type, availability, source_device_id, created_at)
     VALUES ('attachment-1', 'attachment-hash', 'sample.pdf', 12, 'application/pdf', 'available', 'android-b', ?)`,
    [now]
  );
  upsertSyncObjectState(driver, {
    contentHash: 'attachment-state-hash', lastModifiedByDeviceId: 'android-b',
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
    content: 'provider body', id: 'node-1'
  });
  expect(pack.prepare('SELECT hash FROM content_blobs').get()).toBeTruthy();
  expect(pack.prepare("SELECT object_id FROM sync_objects WHERE object_type = 'setting'").get())
    .toEqual({ object_id: 'device:android:phone:*:sample' });
  expect(JSON.parse((pack.prepare(
    "SELECT payload_json FROM sync_objects WHERE object_type = 'attachment'"
  ).get() as { payload_json: string }).payload_json)).toMatchObject({
    attachment_id: 'attachment-1', blob: { content_hash: 'attachment-hash', size_bytes: 12 }
  });
  pack.close();
});

it('keeps the Android provider independent of optional SQLite JSON functions', () => {
  expect(definitions.copyStatements.join('\n')).not.toContain('json_object');
  expect(definitions.payloadPlans.map((plan) => plan.sql).join('\n')).not.toContain('json_object');
});

it('packs current node heads without dangling historical parent edges', () => {
  source.exec(`
    INSERT INTO node_sync_versions (
      version_id, object_id, parent_version_id, device_id, created_at,
      content_hash, body_text, snapshot_json
    ) VALUES (
      'android-b#2', 'node-1', 'android-b#1', 'android-b', '2026-08-08T00:00:00.000Z',
      'node-hash', 'provider body', '{"id":"node-1"}'
    );
    INSERT INTO node_sync_version_parents VALUES ('android-b#2', 'android-b#1', 0);
    UPDATE nodes SET current_version_id = 'android-b#2' WHERE id = 'node-1';
  `);
  const pack = buildPack(0);
  expect(pack.prepare('SELECT version_id FROM node_sync_versions').all())
    .toEqual([{ version_id: 'android-b#2' }]);
  expect(pack.prepare('SELECT * FROM node_sync_version_parents').all()).toEqual([]);
  pack.close();
});

it('loads each payload surface in bulk instead of querying once per state row', () => {
  for (const plan of definitions.payloadPlans) {
    expect(plan.sql).toContain('__object_id');
    expect(plan.sql).not.toContain('?');
  }
});

it('selects an independent delta for each member cursor', () => {
  const baseline = buildPack(0);
  const laterPeer = buildPack(2);
  expect(baseline.prepare('SELECT COUNT(*) AS value FROM sync_object_state').get()).toEqual({ value: 3 });
  expect(laterPeer.prepare('SELECT object_type, object_id FROM sync_object_state').all()).toEqual([{
    object_id: 'attachment-1', object_type: 'attachment'
  }]);
  baseline.close(); laterPeer.close();
});

it('keeps local provisioning rows out of shared group facts', () => {
  const now = '2026-08-08T00:00:00.000Z';
  source.exec(`
    INSERT INTO sync_groups VALUES ('group-1', 'Daily Group', 'timeline-1', 'android-b', '${now}', '${now}');
    INSERT INTO sync_group_local_state
      (singleton_id, group_id, local_device_id, member_state, updated_at)
      VALUES (1, 'group-1', 'android-b', 'active', '${now}');
    INSERT INTO sync_group_members
      (group_id, device_id, device_kind, device_name, state, approved_by_device_id,
       authorization_id, joined_at, updated_at)
      VALUES
      ('group-1', 'android-b', 'android-capacitor', 'Android B', 'active', 'android-b',
       'authorization-b', '${now}', '${now}'),
      ('group-1', 'desktop-c', 'win32', 'Desktop C', 'provisioning', 'android-b',
       'authorization-c', '${now}', '${now}');
  `);
  const pack = buildPack(0);
  expect(pack.prepare('SELECT device_id FROM sync_group_members').all()).toEqual([{ device_id: 'android-b' }]);
  pack.close();
});

function buildPack(fromStateSeq: number) {
  const pack = new Database(':memory:');
  for (const statement of definitions.packSchema) pack.exec(statement);
  pack.prepare('ATTACH DATABASE ? AS source').run(sourcePath);
  definitions.copyStatements.forEach((statement, index) => {
    if (index === definitions.stateCopyIndex) pack.prepare(statement).run(fromStateSeq, 3);
    else if (index === definitions.payloadCopyIndex) {
      copyPayloads(pack);
      pack.exec(statement);
    }
    else pack.exec(statement);
  });
  pack.exec('DETACH DATABASE source');
  return pack;
}

function copyPayloads(pack: Database.Database) {
  const payloads = new Map<string, Record<string, unknown>>();
  for (const plan of definitions.payloadPlans) {
    for (const row of pack.prepare(plan.sql).all() as Array<Record<string, unknown>>) {
      const objectId = String(row.__object_id);
      delete row.__object_id;
      payloads.set(`${plan.objectType}\u0000${objectId}`, nestedPayload(row));
    }
  }
  const states = pack.prepare(`SELECT object_type, object_id, content_hash, updated_at, deleted_at
    FROM sync_object_state WHERE object_type NOT IN ('external_document','node')`).all() as Array<Record<string, unknown>>;
  const insert = pack.prepare(`INSERT INTO sync_objects
    (object_type, object_id, content_hash, payload_json, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const state of states) {
    const row = state.deleted_at == null ? payloads.get(`${state.object_type}\u0000${state.object_id}`) : null;
    if (state.deleted_at == null && row === undefined) continue;
    insert.run(state.object_type, state.object_id, state.content_hash,
      row ? JSON.stringify(row) : null, state.updated_at, state.deleted_at);
  }
}

function nestedPayload(row: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const [parent = '', child] = key.split('__');
    if (!child) payload[parent] = value;
    else {
      const nested = (payload[parent] ??= {}) as Record<string, unknown>;
      nested[child] = value;
    }
  }
  return payload;
}
