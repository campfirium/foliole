// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { reviewHistoryOpId } from '../../lib/core/review/reviewEventIdentity.js';

import { createDesktopFramedSyncTwoProcessFixture, type DesktopFramedSyncFixtureProcess } from './desktopFramedSyncTwoProcess.testSupport.js';

const nodeId = 'review-projection';
const t1 = '2026-10-01T08:00:00.000Z';
const t2 = '2026-10-03T08:00:00.000Z';
const t3 = '2026-10-05T08:00:00.000Z';
const t4 = '2026-10-06T08:00:00.000Z';
function mutate(peer: DesktopFramedSyncFixtureProcess, mode: 'grade' | 'reset' | 'undo' | 'redo', opId: string, at: string) {
  return peer.invoke('review_projection', { mode, nodeId, opId, at, grade: 3 });
}
function state(file: string) {
  const db = new Database(file, { readonly: true });
  try { return { cards: db.prepare('SELECT * FROM node_review WHERE node_id = ?').all(nodeId),
    events: db.prepare('SELECT * FROM review_log WHERE node_id = ? ORDER BY op_id').all(nodeId) }; }
  finally { db.close(); }
}

it.each(['relay', 'offline', 'late-history', 'reset-before', 'reset-after', 'undo-redo'])(
  'persists the same projection across independent processes, replay and restart: %s', async scenario => {
    const f = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
    try {
      expect(f.leftSnapshot.pid).not.toBe(f.rightSnapshot.pid);
      await f.left.seed({ nodeId, kind: 'item', title: 'Review', content: 'Question', updatedAt: t1 });
      await f.left.synchronize(f.rightSnapshot.origin, nodeId);
      await mutate(f.left, 'grade', 'first', t1);
      if (scenario === 'relay' || scenario === 'undo-redo' || scenario.startsWith('reset')) {
        await f.left.synchronize(f.rightSnapshot.origin, nodeId);
      }
      if (scenario.startsWith('reset')) await mutate(f.left, 'reset', 'reset', scenario === 'reset-before'
        ? '2026-10-02T08:00:00.000Z' : t3);
      await mutate(f.right, 'grade', 'second', t2);
      if (scenario === 'late-history') await mutate(f.right, 'grade', 'third', t3);
      if (scenario === 'undo-redo') await mutate(f.left, 'undo', 'first', t3);
      await f.left.synchronize(f.rightSnapshot.origin, nodeId);
      await f.right.synchronize(f.leftSnapshot.origin, nodeId);
      if (scenario === 'undo-redo') {
        await mutate(f.left, 'redo', 'first', t4);
        await f.left.synchronize(f.rightSnapshot.origin, nodeId);
        await mutate(f.left, 'undo', reviewHistoryOpId('first', t4, 'redo'), '2026-10-07T08:00:00.000Z');
        await f.left.synchronize(f.rightSnapshot.origin, nodeId);
      }
      const before = state(f.leftSnapshot.databasePath);
      expect(state(f.rightSnapshot.databasePath)).toEqual(before);
      const expectedReps = scenario === 'reset-before' || scenario === 'undo-redo' ? 1 : scenario === 'late-history' ? 3 : 2;
      if (scenario === 'reset-after') expect(before.cards).toEqual([]);
      else expect(before.cards).toEqual([expect.objectContaining({ reps: expectedReps })]);
      const restarted = await f.restartRight();
      await f.left.synchronize(restarted.snapshot.origin, nodeId);
      await f.right.synchronize(f.leftSnapshot.origin, nodeId);
      expect(state(f.rightSnapshot.databasePath)).toEqual(before);
      expect(state(f.leftSnapshot.databasePath)).toEqual(before);
    } finally {
      await Promise.allSettled([f.left.close(), f.right.close()]);
      await fs.rm(f.root, { recursive: true, force: true });
    }
  }
);
