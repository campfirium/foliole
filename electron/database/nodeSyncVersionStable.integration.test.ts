// @vitest-environment node
import { expect, it } from 'vitest';

import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../../lib/core/database/bodyContentOwnerMigration.js';
import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { loadVerifiedBodyRefWithDriver, readBodyTextWithDriver } from '../../lib/core/database/verifiedBodyWithDriver.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { observeDriver } from './bodyContentDriver.testSupport.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { branches } from './syncNodeVerifiedTopicConflict.testSupport.js';
import { textDevice } from './topicTextState.testSupport.js';

const now = '2026-10-07T12:00:00.000Z';

it.each(['', '\ufeff中😀\0"\\\n'.repeat(250000)])('flushes the original local version identity from bounded body ranges', async (body) => {
  const old = textDevice(); const stable = textDevice();
  try {
    const { base, local } = branches(body, 'Remote');
    for (const host of [old, stable]) {
      await host.receive([base, local]);
      host.sqlite.exec("UPDATE nodes SET sync_dirty = 1 WHERE id = 'topic'");
    }
    await stable.db.transaction(async (tx) => {
      await migrateBodyContentStorage(tx); await migrateBodyContentOwners(tx, 'desktop');
    });
    stable.sqlite.exec('DROP TABLE content_blob_data');
    const oldDriver = createBetterSqlite3Driver(old.sqlite);
    const stableDriver = createBetterSqlite3Driver(stable.sqlite);
    const reads = observeDriver(stableDriver);
    expect(flushNodeSyncVersionWithDriver(oldDriver, 'topic', 'host', now, 'successor')).toBe('successor');
    expect(flushNodeSyncVersionWithDriver(reads.driver, 'topic', 'host', now, 'successor', 'chunked')).toBe('successor');
    const original = oldDriver.queryOne<{ content_hash: string; snapshot_json: string }>(
      "SELECT content_hash, snapshot_json FROM node_sync_versions WHERE version_id = 'successor'")!;
    const current = stableDriver.queryOne<{ content_hash: string; snapshot_json: string; body_text: null;
      body_state: string; body_blob_hash: string }>(
      "SELECT content_hash, snapshot_json, body_text, body_state, body_blob_hash FROM node_sync_versions WHERE version_id = 'successor'")!;
    expect(current.content_hash).toBe(original.content_hash);
    expect(JSON.parse(current.snapshot_json)).toEqual({ ...JSON.parse(original.snapshot_json), content: null });
    expect(current).toMatchObject({ body_text: null, body_state: 'readable' });
    expect(readBodyTextWithDriver(stableDriver, loadVerifiedBodyRefWithDriver(stableDriver, current.body_blob_hash)!)).toBe(body);
    for (const sql of ['SELECT version_id, parent_version_id, ordinal FROM node_sync_version_parents ORDER BY version_id, ordinal',
      'SELECT current_version_id, sync_dirty FROM nodes', 'SELECT * FROM node_version_local_origins ORDER BY version_id']) {
      expect(stableDriver.queryAll(sql)).toEqual(oldDriver.queryAll(sql));
    }
    expect(flushNodeSyncVersionWithDriver(reads.driver, 'topic', 'host', now, undefined, 'chunked')).toBeNull();
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});

it('keeps unavailable stable bodies dirty without creating a version', async () => {
  const host = textDevice();
  try {
    const { base } = branches('Body', 'Remote'); await host.receive([base]);
    await host.db.transaction(migrateBodyContentStorage);
    host.sqlite.exec("DELETE FROM content_bodies; UPDATE nodes SET sync_dirty = 1");
    const driver = createBetterSqlite3Driver(host.sqlite);
    expect(flushNodeSyncVersionWithDriver(driver, 'topic', 'host', now, 'missing', 'chunked')).toBeNull();
    expect(driver.queryOne('SELECT sync_dirty FROM nodes')).toEqual({ sync_dirty: 1 });
    expect(driver.queryOne("SELECT 1 FROM node_sync_versions WHERE version_id = 'missing'")).toBeUndefined();
  } finally { host.sqlite.close(); }
});

it('writes only stable body bytes and rolls back staging when manifest adoption fails', async () => {
  const host = textDevice();
  try {
    await host.db.transaction(migrateBodyContentStorage);
    const driver = createBetterSqlite3Driver(host.sqlite);
    const body = '\ufeffStored中😀\0'.repeat(100000);
    const hash = upsertTextBodyBlob(driver, body, now, 'chunked');
    expect(readBodyTextWithDriver(driver, loadVerifiedBodyRefWithDriver(driver, hash)!)).toBe(body);
    expect(driver.queryOne('SELECT 1 FROM content_blob_data WHERE hash = ?', [hash])).toBeUndefined();
    host.sqlite.exec(`CREATE TRIGGER reject_manifest BEFORE INSERT ON content_blobs
      BEGIN SELECT RAISE(ABORT, 'manifest_failure'); END`);
    expect(() => upsertTextBodyBlob(driver, 'Rejected body', now, 'chunked')).toThrow('manifest_failure');
    expect(driver.queryOne('SELECT count(*) AS total FROM content_bodies')).toEqual({ total: 1 });
  } finally { host.sqlite.close(); }
});
