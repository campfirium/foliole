// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { stagePushDeliveries, savePeerPushAcksWithinTransaction } from '../../src/shared/platform/companion/sync/syncback/companionSyncDeliveryStore.js';
import type { SyncPushPayload } from '../../src/shared/platform/companionSyncPushProtocol.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const databases: Database.Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

function fixture() {
  const db = new Database(':memory:');
  databases.push(db);
  initializeDatabaseSchema(db);
  db.exec(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
    VALUES ('setting', 'setting-a', 1, 'hash-a', 'source', 'now');`);
  return db;
}

function receipt(db: Database.Database, stream: string, operation: string, hash: string) {
  db.prepare(`INSERT INTO sync_delivery_receipts
    (peer_id, stream_name, operation_id, object_type, object_id, payload_identity,
     local_position, status, created_at, updated_at)
    VALUES ('peer', ?, ?, 'setting', 'setting-a', ?, '1', 'accepted', 'now', 'now')`)
    .run(stream, operation, hash);
}

it('retires an earlier state obligation even when the same hash returns later', () => {
  const db = fixture();
  receipt(db, 'state', 'setting:setting-a:1', 'hash-a');
  receipt(db, 'node_version', 'node:sent-version', 'sent-version');
  receipt(db, 'review_log', 'review_log:event', 'event');

  db.exec("UPDATE sync_object_state SET state_seq = 2, content_hash = 'hash-b'");
  db.exec("UPDATE sync_object_state SET state_seq = 3, content_hash = 'hash-a'");

  expect(db.prepare('SELECT stream_name FROM sync_delivery_receipts ORDER BY stream_name').all())
    .toEqual([{ stream_name: 'node_version' }, { stream_name: 'review_log' }]);
});

it('keeps the current obligation on acknowledgement and removes it with the state', () => {
  const db = fixture();
  receipt(db, 'state', 'setting:setting-a:1', 'hash-a');
  db.exec('UPDATE sync_object_state SET sync_dirty = 0');
  expect(db.prepare('SELECT COUNT(*) FROM sync_delivery_receipts').pluck().get()).toBe(1);
  db.exec('DELETE FROM sync_object_state');
  expect(db.prepare('SELECT COUNT(*) FROM sync_delivery_receipts').pluck().get()).toBe(0);
});

it('retires old receipts when a native or pack write replaces the state row', () => {
  const db = fixture();
  receipt(db, 'state', 'setting:setting-a:1', 'hash-a');
  db.exec(`INSERT OR REPLACE INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
    VALUES ('setting', 'setting-a', 2, 'hash-b', 'source', 'later')`);
  expect(db.prepare('SELECT COUNT(*) FROM sync_delivery_receipts').pluck().get()).toBe(0);
});

it('does not revive a superseded state obligation when an in-flight batch is staged or acknowledged late', async () => {
  const db = fixture();
  const port = createBetterSqliteDbPort(db);
  const payload: SyncPushPayload = {
    authorHostName: 'source', base: { kind: 'content_hash', baseContentHash: null },
    clientOpId: 'setting:setting-a:1', contentHash: 'hash-a',
    identity: { objectId: 'setting-a', objectType: 'setting', scope: 'shared' }, payloadJson: '{}'
  };
  await stagePushDeliveries(port, 'peer', [payload]);
  db.exec("UPDATE sync_object_state SET state_seq = 2, content_hash = 'hash-b'");
  await stagePushDeliveries(port, 'peer', [payload]);
  expect(await savePeerPushAcksWithinTransaction(port, 'peer', [{ clientOpId: payload.clientOpId,
    identity: payload.identity, status: 'accepted', stateSeq: 20 }])).toEqual([]);
  expect(db.prepare('SELECT COUNT(*) FROM sync_delivery_receipts').pluck().get()).toBe(0);
  await stagePushDeliveries(port, 'peer', [{ ...payload, clientOpId: 'setting:setting-a:2', contentHash: 'hash-b' }]);
  expect(db.prepare('SELECT operation_id FROM sync_delivery_receipts').pluck().get()).toBe('setting:setting-a:2');
});
