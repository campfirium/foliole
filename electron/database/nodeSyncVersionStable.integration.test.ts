// @vitest-environment node
import { expect, it } from 'vitest';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { branches } from './syncNodeVerifiedTopicConflict.testSupport.js';
import { textDevice } from './topicTextState.testSupport.js';

const now = '2026-10-07T12:00:00.000Z';

it.each(['', '\ufeff中😀\0"\\\n'.repeat(80000)])('flushes exact node text with the same identity regardless of obsolete shared data', async (body) => {
  const left = textDevice();
  const right = textDevice();
  try {
    const { base, local } = branches(body, 'Remote');
    for (const host of [left, right]) {
      await host.receive([base, local]);
      host.sqlite.exec("UPDATE nodes SET sync_dirty = 1 WHERE id='topic'");
    }
    upsertTextBodyBlob(createBetterSqlite3Driver(left.sqlite), body, now);
    left.sqlite.exec("UPDATE content_blob_data SET data = CAST('obsolete copy' AS BLOB)");
    for (const host of [left, right]) {
      const driver = createBetterSqlite3Driver(host.sqlite);
      expect(flushNodeSyncVersionWithDriver(driver, 'topic', 'host', now, 'successor')).toBe('successor');
      expect(host.sqlite.prepare("SELECT body_text = ? AS exact FROM node_sync_versions WHERE version_id='successor'").get(body))
        .toEqual({ exact: 1 });
      expect(host.sqlite.prepare("SELECT content = ? AS exact FROM nodes WHERE id='topic'").get(body)).toEqual({ exact: 1 });
      expect(flushNodeSyncVersionWithDriver(driver, 'topic', 'host', now)).toBeNull();
    }
    for (const sql of ["SELECT version_id, object_id, content_hash, snapshot_json FROM node_sync_versions WHERE version_id='successor'",
      'SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal',
      'SELECT current_version_id, sync_dirty FROM nodes']) {
      expect(left.sqlite.prepare(sql).all()).toEqual(right.sqlite.prepare(sql).all());
    }
  } finally { left.sqlite.close(); right.sqlite.close(); }
});

it('rolls back the version, edges and head together when publication fails and permits the same retry', async () => {
  const host = textDevice();
  try {
    const { base } = branches('Body', 'Remote');
    await host.receive([base]);
    host.sqlite.exec("UPDATE nodes SET sync_dirty=1; CREATE TRIGGER reject_version BEFORE INSERT ON node_sync_versions BEGIN SELECT RAISE(ABORT, 'version_failure'); END");
    const driver = createBetterSqlite3Driver(host.sqlite);
    const before = host.sqlite.prepare('SELECT * FROM nodes').all();
    expect(() => flushNodeSyncVersionWithDriver(driver, 'topic', 'host', now, 'retry')).toThrow('version_failure');
    expect(host.sqlite.prepare('SELECT * FROM nodes').all()).toEqual(before);
    expect(host.sqlite.prepare("SELECT 1 FROM node_sync_versions WHERE version_id='retry'").get()).toBeUndefined();
    host.sqlite.exec('DROP TRIGGER reject_version');
    expect(flushNodeSyncVersionWithDriver(driver, 'topic', 'host', now, 'retry')).toBe('retry');
    expect(host.sqlite.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
  } finally { host.sqlite.close(); }
});
