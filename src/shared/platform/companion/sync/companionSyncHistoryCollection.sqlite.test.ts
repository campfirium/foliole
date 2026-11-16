// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort.js';
import { textBranch } from '../../../../../electron/database/topicTextState.testSupport.js';
import { bootstrapCompanionDatabase } from '../../../../../lib/core/database/companionDatabaseLifecycle.js';
import { releaseDeletedNodeBodiesWithPort } from '../../../../../lib/core/database/deletedNodeBodyRelease.js';
import type { DbPort } from '../../../../../lib/core/sync/dbPort.js';
import { recordCompletedSyncGroupRound } from '../../../../../lib/core/sync/syncGroupCoverageStore.js';
import { collectSyncGroupHistory } from '../../../../../lib/core/sync/syncHistoryCollection.js';
import { applyConvergentSyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeConvergence.js';

const databases: Database.Database[] = [];
const roots: string[] = [];
afterEach(() => {
  databases.splice(0).forEach(db => db.close());
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});

async function companion() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-history-collection-'));
  roots.push(root);
  const sqlite = new Database(path.join(root, 'main.db'));
  databases.push(sqlite);
  const port = createBetterSqliteDbPort(sqlite);
  await bootstrapCompanionDatabase(port, { allowCreate: true, expectedHostName: 'phone', expectedJournalMode: 'wal', now: '2026-10-06' });
  sqlite.exec(`INSERT INTO sync_groups VALUES ('group-1', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group-1', 'phone', 'active', 'now');
    INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group-1', 'desktop', 'desktop-anchor', '/desktop', 'Desktop', 'mac', 'active', 'now', 'now'),
      ('group-1', 'phone', 'phone-anchor', '/phone', 'Phone', 'ios', 'active', 'now', 'now')`);
  return { sqlite, port };
}

const collect = (port: DbPort) => collectSyncGroupHistory(write => write(port), 'group-1');

it('reclaims old history and expired deletions in the companion schema only after the group line passes them', async () => {
  const { sqlite, port } = await companion();
  const base = textBranch('base', 'First draft', undefined, '2026-09-01T00:00:00.000Z');
  const middle = textBranch('middle', 'Second draft', base, '2026-09-02T00:00:00.000Z');
  const head = textBranch('head', 'Final text', middle, '2026-09-03T00:00:00.000Z');
  for (const record of [base, middle, head]) await applyConvergentSyncNodesWithDbPort(port, [record]);
  sqlite.exec(`INSERT INTO node_sync_tombstones VALUES ('gone', 'gone-v1', NULL, 'desktop', 'hash', '{}',
    '2026-09-05T00:00:00.000Z', '2026-09-05T00:00:00.000Z')`);
  const versions = () => sqlite.prepare("SELECT version_id FROM node_sync_versions WHERE object_id = 'topic' ORDER BY version_id")
    .pluck().all();

  expect(await collect(port)).toEqual({ versions: 0, tombstones: 0 });
  expect(versions()).toEqual(['base', 'head', 'middle']);

  await recordCompletedSyncGroupRound(port, { groupId: 'group-1', localDeviceId: 'phone', peerDeviceId: 'desktop',
    startedAt: '2026-10-20T00:00:00.000Z' });
  expect(await collect(port)).toEqual({ versions: 2, tombstones: 1 });
  expect(versions()).toEqual(['head']);
  expect(sqlite.prepare("SELECT content FROM nodes WHERE id = 'topic'").pluck().get()).toBe('Final text');
  expect(sqlite.prepare('SELECT count(*) FROM node_sync_tombstones').pluck().get()).toBe(0);
  expect(sqlite.prepare("SELECT count(*) FROM node_sync_version_parents WHERE version_id = 'middle'").pluck().get()).toBe(0);
});

it('clears a permanently deleted note’s text in the companion schema while keeping its identities', async () => {
  const { sqlite, port } = await companion();
  const base = textBranch('base', 'Private first draft', undefined, '2026-09-01T00:00:00.000Z');
  const head = textBranch('head', 'Private final text', base, '2026-09-02T00:00:00.000Z');
  for (const record of [base, head]) await applyConvergentSyncNodesWithDbPort(port, [record]);
  sqlite.exec(`INSERT INTO node_sync_tombstones SELECT 'topic', 'head', 'base', 'phone', content_hash,
      json_set(snapshot_json, '$.content', 'Private final text'), '2026-09-03T00:00:00.000Z', '2026-09-03T00:00:00.000Z'
    FROM node_sync_versions WHERE version_id = 'head';
    DELETE FROM nodes WHERE id = 'topic'`);
  await releaseDeletedNodeBodiesWithPort(port, 'topic');
  const rows = sqlite.prepare(`SELECT version_id, body_text, json_extract(snapshot_json, '$.content') AS content,
    json_extract(snapshot_json, '$.opening_text') AS opening FROM node_sync_versions ORDER BY version_id`).all();
  expect(rows).toEqual([{ version_id: 'base', body_text: null, content: null, opening: null },
    { version_id: 'head', body_text: null, content: null, opening: null }]);
  expect(sqlite.prepare(`SELECT version_id, json_extract(snapshot_json, '$.content') AS content
    FROM node_sync_tombstones`).all()).toEqual([{ version_id: 'head', content: null }]);
});

it('reclaims a deletion mark only after the group line and only once its object is gone', async () => {
  const { sqlite, port } = await companion();
  sqlite.exec(`INSERT INTO sync_object_state (object_type, object_id, content_hash, deleted_at, updated_at,
      last_modified_by_host_name, sync_dirty, state_seq)
    VALUES ('import_source', 'source-gone', 'h1', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', 'phone', 0, 901),
      ('import_source', 'source-present', 'h2', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', 'phone', 0, 902),
      ('external_document', 'document-gone', 'h3', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', 'phone', 0, 903);
    INSERT INTO import_sources (source_fingerprint, provider, source_kind, source_name, source_locator,
      first_imported_at, last_imported_at, last_content_fingerprint)
    VALUES ('source-present', 'readwise', 'article', 'Kept', 'locator', '2026-09-01', '2026-09-01', 'f')`);
  const marks = () => sqlite.prepare('SELECT object_id FROM sync_object_state WHERE deleted_at IS NOT NULL ORDER BY 1')
    .pluck().all();
  await collect(port);
  expect(marks()).toEqual(['document-gone', 'source-gone', 'source-present']);
  await recordCompletedSyncGroupRound(port, { groupId: 'group-1', localDeviceId: 'phone', peerDeviceId: 'desktop',
    startedAt: '2026-10-20T00:00:00.000Z' });
  await collect(port);
  expect(marks()).toEqual(['source-present']);
});

async function companionWithTombstones() {
  const { sqlite, port } = await companion();
  sqlite.exec(`WITH RECURSIVE ids(id) AS (
      VALUES(0) UNION ALL SELECT id + 1 FROM ids WHERE id < 400
    )
    INSERT INTO node_sync_tombstones SELECT printf('gone-%03d', id), printf('v-%03d', id),
      NULL, 'phone', 'hash', '{}', '2026-09-05T00:00:00.000Z', '2026-09-05T00:00:00.000Z'
    FROM ids;
    INSERT INTO node_sync_tombstones VALUES ('recent', 'recent-v1', NULL, 'phone', 'hash', '{}',
      '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z');`);
  await recordCompletedSyncGroupRound(port, { groupId: 'group-1', localDeviceId: 'phone', peerDeviceId: 'desktop',
    startedAt: '2026-10-20T00:00:00.000Z' });
  const tombstones = () => sqlite.prepare('SELECT node_id FROM node_sync_tombstones ORDER BY node_id').pluck().all();
  return { sqlite, port, tombstones };
}

it('reclaims covered node tombstones with bounded writes across multiple SQLite transactions', async () => {
  const { port, tombstones } = await companionWithTombstones();
  const writes = vi.spyOn(port, 'run');
  expect(await collect(port)).toEqual({ versions: 0, tombstones: 401 });
  expect(tombstones()).toEqual(['recent']);
  expect(writes.mock.calls.filter(([sql]) => sql.startsWith('DELETE')).length).toBeLessThanOrEqual(30);
});

it('preserves committed progress and rolls back the failed batch before retry', async () => {
  const { sqlite, port, tombstones } = await companionWithTombstones();
  sqlite.exec(`INSERT INTO sync_object_state (object_type, object_id, content_hash, deleted_at, updated_at,
      last_modified_by_host_name, sync_dirty, state_seq)
    VALUES ('node_reading', 'gone-200', 'hash', '2026-10-20', '2026-10-20', 'phone', 0, 901);
    CREATE TRIGGER fail_tombstone_batch BEFORE DELETE ON node_sync_tombstones
    WHEN OLD.node_id = 'gone-201' BEGIN SELECT RAISE(ABORT, 'tombstone batch failure'); END;`);
  const childMark = () => sqlite.prepare(`SELECT object_id FROM sync_object_state
    WHERE object_type = 'node_reading' AND object_id = 'gone-200'`).pluck().get();

  await expect(collect(port)).rejects.toThrow('tombstone batch failure');
  expect(tombstones()).toHaveLength(202);
  expect(tombstones()[0]).toBe('gone-200');
  expect(childMark()).toBe('gone-200');

  sqlite.exec('DROP TRIGGER fail_tombstone_batch');
  expect(await collect(port)).toEqual({ versions: 0, tombstones: 201 });
  expect(tombstones()).toEqual(['recent']);
  expect(childMark()).toBeUndefined();
});
