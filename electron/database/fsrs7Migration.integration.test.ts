// @vitest-environment node
import { rmSync } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { parseReviewModels } from '../../lib/core/database/reviewTrainingModels.js';
import { readStoredReviewCard } from '../../lib/core/database/storedReviewCard.js';
import { recomputeReview } from '../../lib/core/review/recomputeReview.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';
import { RETIRED_REVIEW_TRAINING_ENGINE, reviewModelKey } from '../../lib/core/review/trainingModel.js';
import { identityReviewRowSchema } from '../../lib/core/sync/syncFactRowSchemas.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { firstAt, secondAt, seedReviewPeer, score, history, reviewState, reviewFacts, sendReviews } from './reviewProjection.testSupport.js';

it.each(['desktop', 'android', 'ios'])('upgrades %s once, preserves due, and grades/undoes durably with FSRS7', async host => {
  const f = await restoreFixture(); const peer = f.peer('source');
  try {
    if (host !== 'desktop') {
      peer.sqlite.close(); rmSync(peer.file); peer.sqlite = new Database(peer.file);
      await bootstrapCompanionDatabase(peer.db, { allowCreate: true, expectedHostName: host, now: firstAt });
    }
    await seedReviewPeer(peer);
    score(peer, 'first', firstAt); score(peer, 'second', secondAt);
    peer.sqlite.exec(`UPDATE node_review SET stability = 123, difficulty = 7, due = '2099-01-01T00:00:00.000Z';
      DROP TRIGGER IF EXISTS daily_flow_node_review_update; ALTER TABLE node_review DROP COLUMN stability_fast`);
    const version = host === 'desktop' ? 183 : 112;
    peer.sqlite.pragma(`user_version = ${version}`);
    const facts = reviewFacts(peer);
    const before = reviewState(peer);
    const interrupt = () => { throw new Error('interrupted_fsrs7_upgrade'); };
    if (host === 'desktop') expect(() => initializeDatabaseSchema(peer.sqlite, { beforeVersionCommit: interrupt })).toThrow('interrupted_fsrs7_upgrade');
    else await expect(peer.db.transaction(db => migrateCompanionDatabase(db, version, 113, interrupt))).rejects.toThrow('interrupted_fsrs7_upgrade');
    expect(peer.sqlite.pragma('user_version', { simple: true })).toBe(version);
    expect(reviewState(peer)).toEqual(before);
    if (host === 'desktop') initializeDatabaseSchema(peer.sqlite);
    else await peer.db.transaction(db => migrateCompanionDatabase(db, version, 113));
    const expected = recomputeReview(facts.map(row => identityReviewRowSchema.parse(row)), DEFAULT_REVIEW_SCHEDULER_SETTINGS, 'topic')!;
    const driver = () => createBetterSqlite3Driver(peer.sqlite);
    expect(readStoredReviewCard(driver(), 'topic')).toEqual({ ...expected, due: '2099-01-01T00:00:00.000Z' });
    peer.reopen();
    expect(readStoredReviewCard(driver(), 'topic')?.due).toBe('2099-01-01T00:00:00.000Z');
    expect(reviewFacts(peer)).toEqual(facts);
    score(peer, 'third', '2026-10-03T09:00:00.000Z');
    const graded = readStoredReviewCard(driver(), 'topic')!;
    expect(graded.stability_fast).toBeGreaterThan(0);
    expect(graded.elapsed_days).toBeCloseTo(1 / 24);
    history(peer, 'undo', 'third', '2026-10-03T10:00:00.000Z');
    peer.reopen();
    expect(readStoredReviewCard(driver(), 'topic')).toEqual(expected);
  } finally { await f.close(); }
});

it.each(['partial', 'none', 'reset'])('automatically upgrades %s history without inventing review facts', async mode => {
  const f = await restoreFixture(); const peer = f.peer('source');
  try {
    await seedReviewPeer(peer); score(peer, 'first', firstAt); score(peer, 'second', secondAt);
    peer.sqlite.exec(mode === 'partial' ? "DELETE FROM review_log WHERE op_id = 'first'" : 'DELETE FROM review_log');
    if (mode === 'reset') peer.sqlite.exec(`INSERT INTO review_log
      (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at, kind)
      VALUES ('reset','reset','source','topic',0,'','2026-10-04T00:00:00.000Z','reset')`);
    peer.sqlite.exec('DROP TRIGGER IF EXISTS daily_flow_node_review_update; ALTER TABLE node_review DROP COLUMN stability_fast; PRAGMA user_version = 183');
    const facts = reviewFacts(peer);
    initializeDatabaseSchema(peer.sqlite);
    expect(reviewFacts(peer)).toEqual(facts);
    const card = readStoredReviewCard(createBetterSqlite3Driver(peer.sqlite), 'topic')!;
    expect(card.reps).toBe(mode === 'partial' ? 1 : 0);
    expect(card.stability_fast).toBe(mode === 'partial' ? 3.13768 : 0);
    score(peer, 'real-review', '2026-10-05T08:00:00.000Z');
    peer.reopen();
    expect(readStoredReviewCard(createBetterSqlite3Driver(peer.sqlite), 'topic')?.reps).toBe(mode === 'partial' ? 2 : 1);
    expect(reviewFacts(peer)).toHaveLength(facts.length + 1);
  } finally { await f.close(); }
});

it('rebuilds the same FSRS7 state in a fresh peer after duplicate and late facts, then reopens both', async () => {
  const f = await restoreFixture(); const a = f.peer('source'), b = f.peer('target');
  try {
    await seedReviewPeer(a); await seedReviewPeer(b);
    score(a, 'later', secondAt); score(b, 'earlier', firstAt);
    await sendReviews(a, b); await sendReviews(b, a); await sendReviews(a, b);
    a.reopen(); b.reopen();
    expect(reviewState(a)).toEqual(reviewState(b));
    expect(readStoredReviewCard(createBetterSqlite3Driver(b.sqlite), 'topic')?.stability_fast).toBeGreaterThan(0);
  } finally { await f.close(); }
});

it('ignores known retired 21-weight models, including a late record, without discarding the facts', () => {
  const row = { key: reviewModelKey('folder'), value_json: JSON.stringify({ engine: RETIRED_REVIEW_TRAINING_ENGINE, weights: Array(21).fill(1) }) };
  expect(parseReviewModels([row])).toEqual([]);
  expect(JSON.parse(row.value_json).weights).toHaveLength(21);
});
