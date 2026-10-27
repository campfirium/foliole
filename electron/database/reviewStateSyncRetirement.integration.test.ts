// @vitest-environment node
import { rmSync } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { retireCompanionReviewStateSync, retireReviewStateSync } from '../../lib/core/database/reviewStateSyncRetirement.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';

import { restoreEmptyLegacyDailyFlowSchema } from './historicalMigration.test-support.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { firstAt, seedReviewPeer, score, reviewState, reviewFacts } from './reviewProjection.testSupport.js';
import { legacyReviewFact } from './reviewStateSyncRetirement.testSupport.js';

it.each(['desktop', 'android', 'ios'])('retires upgraded %s state without changing schedules or facts, including reopen and retry', async host => {
  const f = await restoreFixture(); const peer = f.peer('source');
  try {
    if (host !== 'desktop') {
      peer.sqlite.close(); rmSync(peer.file); peer.sqlite = new Database(peer.file);
      await bootstrapCompanionDatabase(peer.db, { allowCreate: true, expectedHostName: host, now: firstAt });
    }
    await seedReviewPeer(peer); score(peer, 'original', firstAt);
    peer.sqlite.exec("UPDATE node_review SET due='2099-01-01T00:00:00.000Z'");
    const cards = reviewState(peer); const facts = reviewFacts(peer);
    peer.sqlite.prepare(`INSERT INTO sync_object_state
      (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
      VALUES ('node_review', 'topic', 100, ?, 'old', ?, 1)`).run('f'.repeat(64), firstAt);
    peer.sqlite.exec("INSERT INTO sync_node_child_owners VALUES ('node_review', 'topic', 'topic')");
    // An old inventory can still advertise this state until the schema owner retires it.
    peer.sqlite.prepare(`UPDATE framed_sync_inventory SET states_json=? WHERE object_id='topic'`)
      .run(JSON.stringify([JSON.stringify(['node_review', 'topic', 'f'.repeat(64)])]));
    peer.sqlite.exec("INSERT OR REPLACE INTO framed_sync_node_digest VALUES ('topic', 'old', 0)");
    restoreEmptyLegacyDailyFlowSchema(peer.sqlite);
    peer.sqlite.pragma(`user_version = ${host === 'desktop' ? 172 : 99}`);
    const fail = () => { throw new Error('interrupted_upgrade'); };
    if (host === 'desktop') expect(() => initializeDatabaseSchema(peer.sqlite, { beforeVersionCommit: fail })).toThrow('interrupted_upgrade');
    else await expect(peer.db.transaction(db => migrateCompanionDatabase(db, 99, 100, fail))).rejects.toThrow('interrupted_upgrade');
    expect(peer.sqlite.prepare("SELECT count(*) FROM sync_object_state WHERE object_type='node_review'").pluck().get()).toBe(1);
    expect(reviewState(peer)).toEqual(cards); expect(reviewFacts(peer)).toEqual(facts);
    expect(peer.sqlite.pragma('user_version', { simple: true })).toBe(host === 'desktop' ? 172 : 99);
    if (host === 'desktop') initializeDatabaseSchema(peer.sqlite);
    else await peer.db.transaction(db => migrateCompanionDatabase(db, 99, 100));
    peer.reopen();
    if (host === 'desktop') peer.sqlite.transaction(() => retireReviewStateSync(peer.sqlite))();
    else await peer.db.transaction(retireCompanionReviewStateSync);
    expect(reviewState(peer)).toEqual(cards); expect(reviewFacts(peer)).toEqual(facts);
    expect(peer.sqlite.prepare("SELECT * FROM sync_object_state WHERE object_type='node_review'").all()).toEqual([]);
    expect(peer.sqlite.prepare("SELECT * FROM sync_node_child_owners WHERE object_type='node_review'").all()).toEqual([]);
    expect(peer.sqlite.prepare("SELECT * FROM framed_sync_node_digest WHERE object_id='topic'").all()).toEqual([]);
    expect(peer.sqlite.prepare("SELECT states_json FROM framed_sync_inventory WHERE object_id='topic'").pluck().get()).toBe('[]');
    score(peer, 'new-fact', '2026-10-03T08:00:00.000Z');
    expect(reviewFacts(peer)).toHaveLength(2);
    expect(peer.sqlite.prepare('SELECT reps FROM node_review').pluck().get()).toBe(2);
    expect(peer.sqlite.prepare("SELECT * FROM sync_object_state WHERE object_type='node_review'").all()).toEqual([]);
  } finally { await f.close(); }
});

it.each([false, true])('accepts and ignores standalone legacy review state, deleted=%s', async deleted => {
  const f = await restoreFixture(); const a = f.peer('source'); const b = f.peer('target');
  try {
    await seedReviewPeer(b); score(b, 'original', firstAt);
    const cards = reviewState(b); const facts = reviewFacts(b);
    const fact = legacyReviewFact('topic', deleted, true);
    await applyRequestSyncObject(b.db, { globalId: 'topic', objectType: 'node_review', requestId: new Uint8Array(16),
      context: { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
        senderDeviceId: a.id, senderLibraryEpoch: a.epoch, receiverDeviceId: b.id, receiverLibraryEpoch: b.epoch },
      peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: a.id, library_epoch: a.epoch,
        proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
      facts: async function* (_db, kinds) { if (!kinds || kinds.includes(fact.kind)) yield fact; },
      loadBody: async () => { throw new Error('unexpected_body'); } });
    b.reopen(); expect(reviewState(b)).toEqual(cards); expect(reviewFacts(b)).toEqual(facts);
    expect(b.sqlite.prepare("SELECT * FROM sync_object_state WHERE object_type='node_review'").all()).toEqual([]);
  } finally { await f.close(); }
});
