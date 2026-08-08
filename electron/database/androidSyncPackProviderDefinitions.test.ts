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
  pack.close();
});

it('selects an independent delta for each member cursor', () => {
  const baseline = buildPack(0);
  const laterPeer = buildPack(1);
  expect(baseline.prepare('SELECT COUNT(*) AS value FROM sync_object_state').get()).toEqual({ value: 2 });
  expect(laterPeer.prepare('SELECT object_type, object_id FROM sync_object_state').all()).toEqual([{
    object_id: 'device:android:phone:*:sample', object_type: 'setting'
  }]);
  baseline.close(); laterPeer.close();
});

function buildPack(fromStateSeq: number) {
  const pack = new Database(':memory:');
  for (const statement of definitions.packSchema) pack.exec(statement);
  pack.prepare('ATTACH DATABASE ? AS source').run(sourcePath);
  definitions.copyStatements.forEach((statement, index) => {
    if (index === 0) pack.prepare(statement).run(fromStateSeq, 2);
    else pack.exec(statement);
  });
  pack.exec('DETACH DATABASE source');
  return pack;
}
