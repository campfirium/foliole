// @vitest-environment node
import { expect, it } from 'vitest';

import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { restoreFixture, type RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { firstAt, secondAt, seedReviewPeer, score, reset, reviewState, reviewFacts, sendReviews } from '../database/reviewProjection.testSupport.js';
import { seedReading, sendReadingNode } from '../database/syncPackLearningStateEndToEnd.testSupport.js';



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

it.each(['same', 'changed', 'reset'] as const)('rebuilds review projections from current facts and preserves replay: %s', async mode => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await seedReviewPeer(source);
    score(source, 'first', firstAt);
    await sendReviews(source, target); target.reopen();
    const originalFacts = reviewFacts(target);
    const originalState = reviewState(target);
    expect(originalFacts).toHaveLength(1);
    if (mode === 'changed') score(source, 'second', secondAt);
    if (mode === 'reset') reset(source, secondAt);
    const expectedFacts = reviewFacts(source);
    const expectedState = reviewState(source);
    expect(expectedFacts).toEqual(expect.arrayContaining(originalFacts));
    if (mode === 'same') expect(expectedState).toEqual(originalState);
    else {
      expect(expectedFacts).toHaveLength(2);
      expect(expectedState).not.toEqual(originalState);
    }
    if (mode === 'reset') expect(expectedState).toEqual([]);
    for (let replay = 0; replay < 2; replay++) {
      await sendReviews(source, target); target.reopen();
      expect(reviewFacts(target)).toEqual(expectedFacts);
      expect(reviewState(target)).toEqual(expectedState);
      for (const peer of [source, target]) expect(peer.sqlite.prepare(
        "SELECT * FROM sync_object_state WHERE object_type = 'node_review'").all()).toEqual([]);
    }
  } finally { await fixture.close(); }
});
