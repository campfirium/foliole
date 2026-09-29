// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { hashText } from '../../lib/core/sync/syncNodeResolution.js';
import { retireObsoleteSyncPackDependencyViews } from '../../lib/core/sync/syncPackDependencyResume.js';
import { assertDirectSyncPackKnownFactClaims, assertStagedSyncPackKnownFactsStillHeld,
  clearSyncPackKnownFactClaims,
  stageSyncPackKnownFactClaims } from '../../lib/core/sync/syncPackKnownFactClaims.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

let root: string;
let db: Database.Database;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-known-facts-'));
  db = new Database(path.join(root, 'receiver.db'));
  initializeDatabaseSchema(db);
});
afterEach(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });

const scope = { groupId: 'group', peerId: 'source', sourceViewId: 'view' };
const fact = { version_id: 'version', object_id: 'node', parent_version_id: null,
  host_name: 'source', created_at: 'now', content_hash: 'hash', body_hash: 'body-hash',
  snapshot_metadata: '{"id":"node"}' };

it('retains bounded claims and rejects a body collected before final business apply', async () => {
  db.prepare(`INSERT INTO nodes (id, kind, title, created_at, updated_at)
    VALUES ('node', 'topic', 'Node', 'now', 'now')`).run();
  db.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES ('version', 'node', NULL, 'source', 'now', 'hash', 'body', '{"id":"node","content":null}')`).run();
  const port = createBetterSqliteDbPort(db);
  const index = { from_state_seq: 0, to_state_seq: 1, frontier_state_seq: 1,
    source_epoch: 'epoch', index_id: 'page', versions: [{ ...fact, body_hash: hashText('body') }],
    parents: [], reviews: [] };
  expect((await stageSyncPackKnownFactClaims(port, scope, index)).versions).toEqual(['version']);
  await assertStagedSyncPackKnownFactsStillHeld(port, scope);
  db.prepare('UPDATE node_sync_versions SET body_text = NULL WHERE version_id = ?').run('version');
  await expect(assertStagedSyncPackKnownFactsStillHeld(port, scope))
    .rejects.toThrow('sync_pack_fact_presence_changed');
  db.prepare("UPDATE node_sync_versions SET body_text = 'body' WHERE version_id = 'version'").run();
  await clearSyncPackKnownFactClaims(port, scope);
  expect(db.prepare('SELECT count(*) AS count FROM sync_pack_known_fact_claims').get())
    .toEqual({ count: 0 });
});

it('binds a direct known-fact pack to its round and rechecks held data', async () => {
  db.prepare(`INSERT INTO nodes (id, kind, title, created_at, updated_at)
    VALUES ('node', 'topic', 'Node', 'now', 'now')`).run();
  db.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES ('version', 'node', NULL, 'source', 'now', 'hash', 'body', '{"id":"node","content":null}')`).run();
  const port = createBetterSqliteDbPort(db);
  await stageSyncPackKnownFactClaims(port, scope, { from_state_seq: 2, to_state_seq: 3,
    frontier_state_seq: 3, source_epoch: 'epoch', index_id: 'page',
    versions: [{ ...fact, body_hash: hashText('body') }], parents: [], reviews: [] });
  const round = { groupId: 'group', peerId: 'source', packId: 'view',
    fromStateSeq: 2, toStateSeq: 3, frontierStateSeq: 3, sourceEpoch: 'epoch' };
  expect(await assertDirectSyncPackKnownFactClaims(port, round)).toBe(true);
  await expect(assertDirectSyncPackKnownFactClaims(port, { ...round, toStateSeq: 4 }))
    .rejects.toThrow('sync_pack_fact_index_changed');
  db.prepare("UPDATE node_sync_versions SET body_text = NULL WHERE version_id = 'version'").run();
  await expect(assertDirectSyncPackKnownFactClaims(port, round))
    .rejects.toThrow('sync_pack_fact_presence_changed');
});

it('retires a fact-only view after the receive cursor passes its start', async () => {
  const port = createBetterSqliteDbPort(db);
  const index = { from_state_seq: 2, to_state_seq: 3, frontier_state_seq: 3,
    source_epoch: 'epoch', index_id: 'page', versions: [], parents: [], reviews: [] };
  await stageSyncPackKnownFactClaims(port, scope, index);
  await retireObsoleteSyncPackDependencyViews(port, { groupId: 'group', peerId: 'source',
    currentCursor: 2 });
  expect(db.prepare('SELECT count(*) AS count FROM sync_pack_known_fact_claims').get())
    .toEqual({ count: 1 });
  await retireObsoleteSyncPackDependencyViews(port, { groupId: 'group', peerId: 'source',
    currentCursor: 3 });
  expect(db.prepare('SELECT count(*) AS count FROM sync_pack_known_fact_claims').get())
    .toEqual({ count: 0 });
});
