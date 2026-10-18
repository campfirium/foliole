// @vitest-environment node
import { expect, it } from 'vitest';

import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { restoreFixture, type RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { seedReading, sendReadingNode } from '../database/syncPackLearningStateEndToEnd.testSupport.js';

import { sendCurrentObject } from './currentRequestLearning.testSupport.js';

function currentReadingState(peer: RestorePeer) {
  return peer.sqlite.prepare("SELECT * FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'topic'").get();
}

it('keeps current reading state stable on replay and accepts a later changed reading snapshot', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    seedReading(source, 'topic');
    await sendReadingNode(source, target, 'topic');
    const original = currentReadingState(target);
    await sendReadingNode(source, target, 'topic'); target.reopen();
    expect(currentReadingState(target)).toEqual(original);
    saveNodeReadingStateWithSync(createBetterSqlite3Driver(source.sqlite), {
      nodeId: 'topic', hostName: 'desktop-source', updatedAt: '2026-05-08T00:00:00.000Z',
      reading: { intervalDurationMs: 180000, intervalGrowthFactor: 2, lastHandledAt: '2026-05-08T00:00:00.000Z',
        nextAt: '2026-05-09T00:00:00.000Z', priority: 1, readingPosition: 0, repetitionCount: 3, state: 'active' }
    });
    await sendReadingNode(source, target, 'topic'); target.reopen();
    expect(currentReadingState(target)).not.toEqual(original);
    expect(target.sqlite.prepare('SELECT * FROM node_reading').all()).toEqual(source.sqlite.prepare('SELECT * FROM node_reading').all());
    const changed = currentReadingState(target);
    await sendReadingNode(source, target, 'topic'); target.reopen();
    expect(currentReadingState(target)).toEqual(changed);
  } finally { await fixture.close(); }
});

it('applies a current reading deletion even with the previous content hash and keeps replay stable', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    seedReading(source, 'topic'); await sendReadingNode(source, target, 'topic');
    const hash = source.sqlite.prepare("SELECT content_hash FROM sync_object_state WHERE object_type = 'node_reading'").pluck().get();
    source.sqlite.exec("UPDATE sync_object_state SET deleted_at = '2026-05-08T00:00:00.000Z', updated_at = '2026-05-08T00:00:00.000Z' WHERE object_type = 'node_reading'");
    await sendReadingNode(source, target, 'topic'); target.reopen();
    expect(target.sqlite.prepare("SELECT content_hash, deleted_at FROM sync_object_state WHERE object_type = 'node_reading'").get())
      .toEqual({ content_hash: hash, deleted_at: '2026-05-08T00:00:00.000Z' });
    expect(target.sqlite.prepare('SELECT * FROM node_reading').all()).toEqual([]);
    const deleted = currentReadingState(target);
    await sendReadingNode(source, target, 'topic'); target.reopen();
    expect(currentReadingState(target)).toEqual(deleted);
  } finally { await fixture.close(); }
});

async function reviewState(peer: RestorePeer, changed: boolean) {
  const at = changed ? '2026-05-08T00:00:00.000Z' : '2026-05-01T00:00:00.000Z';
  const payload = { node_id: 'topic', due: '2026-05-09T00:00:00.000Z', last_review_at: at, state: 2,
    stability: 3, difficulty: 4, elapsed_days: 1, scheduled_days: 1, reps: changed ? 3 : 2, lapses: 0 };
  await peer.db.transaction(db => applySyncObjectInTransaction(db, { object_type: 'node_review', object_id: 'topic',
    content_hash: computeSyncContentHash('node_review', payload), payload_json: JSON.stringify(payload),
    updated_at: at, deleted_at: null }));
}

it.each(['same', 'changed', 'deleted'] as const)('applies the independent current review state and preserves replay: %s', async mode => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await source.seed('topic'); await sendCurrentObject(source, target);
    await reviewState(source, false); await sendCurrentObject(source, target, 'node');
    const state = () => target.sqlite.prepare("SELECT * FROM sync_object_state WHERE object_type = 'node_review'").get();
    const original = state();
    if (mode === 'changed') await reviewState(source, true);
    if (mode === 'deleted') source.sqlite.exec("UPDATE sync_object_state SET deleted_at = '2026-05-08T00:00:00.000Z', updated_at = '2026-05-08T00:00:00.000Z' WHERE object_type = 'node_review'");
    await sendCurrentObject(source, target, 'node'); target.reopen();
    if (mode === 'same') expect(state()).toEqual(original);
    else expect(state()).not.toEqual(original);
    if (mode === 'deleted') {
      expect(target.sqlite.prepare('SELECT * FROM node_review').all()).toEqual([]);
      expect(target.sqlite.prepare("SELECT content_hash, deleted_at FROM sync_object_state WHERE object_type = 'node_review'").get())
        .toEqual(source.sqlite.prepare("SELECT content_hash, deleted_at FROM sync_object_state WHERE object_type = 'node_review'").get());
    } else expect(target.sqlite.prepare('SELECT * FROM node_review').all()).toEqual(source.sqlite.prepare('SELECT * FROM node_review').all());
    const applied = state();
    await sendCurrentObject(source, target, 'node'); target.reopen();
    expect(state()).toEqual(applied);
  } finally { await fixture.close(); }
});
