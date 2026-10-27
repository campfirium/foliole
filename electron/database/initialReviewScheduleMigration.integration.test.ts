// @vitest-environment node
import { rmSync } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { projectFramedSyncNodeRecord, restoreFramedSyncProjectedNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';

import { restoreEmptyLegacyDailyFlowSchema } from './historicalMigration.test-support.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { firstAt, reviewFacts, reviewState, score, seedReviewPeer } from './reviewProjection.testSupport.js';

it.each(['desktop', 'android', 'ios'])('upgrades %s initial scheduling atomically without recalculating existing cards', async host => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  try {
    if (host !== 'desktop') {
      peer.sqlite.close(); rmSync(peer.file); peer.sqlite = new Database(peer.file);
      await bootstrapCompanionDatabase(peer.db, { allowCreate: true, expectedHostName: host, now: firstAt });
    }
    await seedReviewPeer(peer);
    score(peer, 'previous-score', firstAt);
    peer.sqlite.exec(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
      VALUES ('new-card', 'item', 'New', '', '${firstAt}', '${firstAt}');
      INSERT INTO node_review (node_id, due, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses)
      VALUES ('new-card', '2099-01-01T00:00:00.000Z', 0, 0, 0, 0, 0, 0, 0);
      ALTER TABLE nodes DROP COLUMN initial_review_due`);
    const oldVersion = host === 'desktop' ? 173 : 100;
    restoreEmptyLegacyDailyFlowSchema(peer.sqlite);
    peer.sqlite.pragma(`user_version = ${oldVersion}`);
    const before = reviewState(peer);
    const facts = reviewFacts(peer);
    const interrupt = () => { throw new Error('interrupted_initial_schedule_upgrade'); };
    if (host === 'desktop') expect(() => initializeDatabaseSchema(peer.sqlite, { beforeVersionCommit: interrupt }))
      .toThrow('interrupted_initial_schedule_upgrade');
    else await expect(peer.db.transaction(db => migrateCompanionDatabase(db, 100, 101, interrupt)))
      .rejects.toThrow('interrupted_initial_schedule_upgrade');
    expect(peer.sqlite.prepare('PRAGMA table_info(nodes)').all()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'initial_review_due' })]));
    expect(peer.sqlite.pragma('user_version', { simple: true })).toBe(oldVersion);
    expect(reviewState(peer)).toEqual(before);
    if (host === 'desktop') initializeDatabaseSchema(peer.sqlite);
    else await peer.db.transaction(db => migrateCompanionDatabase(db, 100, 101));
    peer.reopen();
    expect(reviewState(peer)).toEqual(before);
    expect(reviewFacts(peer)).toEqual(facts);
    expect(peer.sqlite.prepare('SELECT id, initial_review_due FROM nodes WHERE kind = ? ORDER BY id').all('item'))
      .toEqual([{ id: 'new-card', initial_review_due: '2099-01-01T00:00:00.000Z' }, { id: 'topic', initial_review_due: null }]);
    if (host !== 'desktop') {
      const receiver = fixture.peer('target');
      const record = await loadCurrentSyncNodeRecord(peer.db, 'new-card');
      expect(record?.snapshot.initial_review_due).toBe('2099-01-01T00:00:00.000Z');
      if (!record) throw new Error('initial_schedule_upgrade_version_missing');
      await applySyncNodesWithDbPort(receiver.db, [restoreFramedSyncProjectedNodeRecord(projectFramedSyncNodeRecord(record))]);
      expect(receiver.sqlite.prepare('SELECT due FROM node_review WHERE node_id = ?').pluck().get('new-card'))
        .toBe('2099-01-01T00:00:00.000Z');
    }
  } finally { await fixture.close(); }
});

it.each(['android', 'ios'])('publishes an upgraded %s schedule without rewriting its original node version', async host => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  try {
    peer.sqlite.close(); rmSync(peer.file); peer.sqlite = new Database(peer.file);
    await bootstrapCompanionDatabase(peer.db, { allowCreate: true, expectedHostName: host, now: firstAt });
    await seedReviewPeer(peer);
    const original = peer.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
    peer.sqlite.exec(`INSERT INTO node_review (node_id, due, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses)
      VALUES ('topic', '2099-01-01T00:00:00.000Z', 0, 0, 0, 0, 0, 0, 0);
      ALTER TABLE nodes DROP COLUMN initial_review_due; PRAGMA user_version = 100`);
    await peer.db.transaction(db => migrateCompanionDatabase(db, 100, 101));
    peer.reopen();
    expect(peer.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(expect.arrayContaining(original));
    const record = await loadCurrentSyncNodeRecord(peer.db, 'topic');
    expect(record?.snapshot.initial_review_due).toBe('2099-01-01T00:00:00.000Z');
    if (!record) throw new Error('initial_schedule_upgrade_version_missing');
    const receiver = fixture.peer('target');
    await applySyncNodesWithDbPort(receiver.db, [restoreFramedSyncProjectedNodeRecord(projectFramedSyncNodeRecord(record))]);
    receiver.reopen();
    expect(reviewState(receiver)).toEqual(reviewState(peer));
    expect(reviewFacts(peer)).toEqual([]);
    const count = peer.sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get();
    await peer.db.transaction(db => migrateCompanionDatabase(db, 100, 101));
    expect(peer.sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(count);
  } finally { await fixture.close(); }
});
