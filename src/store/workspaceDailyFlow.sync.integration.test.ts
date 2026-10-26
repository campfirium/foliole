// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { score } from '../../electron/database/reviewProjection.testSupport';
import { assertPersisted, closeLibraries, createPeer, edit, joinPeers, startLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { syncRequestLibrary as sync } from '../../electron/database/syncRequestLibrary.testSupport';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState';
import { saveNodeReviewStateWithSync } from '../../lib/core/database/nodeReviewSyncState';
import { applyReviewGrade } from '../../lib/core/database/reviewMutations';
import { hashTextBody } from '../../lib/core/database/textBodyHash';
import { commitDailyFlow, openDailyFlow, type DailyFlowPersistence } from '../../lib/core/flow/dailyFlowService';
import { readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { createFsrsReviewScheduler } from '../../lib/core/review/fsrsScheduler';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, createReviewSchedulerParameters, getReviewSchedulerVersion } from '../../lib/core/review/settings';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

let desktop: Peer;
let mobile: Peer;
const now = '2026-10-03T00:00:00.000Z';
function settings(peer: Peer) {
  return { scope: hashTextBody(peer.file), newDayStartsAtHour: 4, pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue };
}
function persistence(peer: Peer): DailyFlowPersistence {
  return {
    snapshot: async db => (await loadIosCompanionWorkspaceSnapshot(db))!,
    grade: async (_db, value, opId) => applyReviewGrade(peer.driver, { ...value, opId },
      { hostName: peer.name, createId: () => `${opId}-log` }),
    reading: async (_db, value, stamp) => { saveNodeReadingStateWithSync(peer.driver,
      { nodeId: value.nodeId, reading: value.after, updatedAt: stamp, hostName: peer.name }); },
    reviewHistory: async (_db, value, stamp) => saveNodeReviewStateWithSync(peer.driver,
      { nodeId: value.nodeId, review: value.after, hostName: peer.name, updatedAt: stamp,
        history: { mode: value.mode, targetOpId: value.targetOpId } })
  };
}
beforeEach(async () => {
  await startLibraries();
  desktop = createPeer('desktop');
  mobile = createPeer('mobile');
  joinPeers(desktop, mobile);
  for (const peer of [desktop, mobile]) {
    peer.db.exec('CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
    peer.db.prepare("INSERT INTO companion_meta VALUES ('host_name', ?, 'now')").run(peer.name);
  }
  edit(desktop, 'Original question', 'Card', null, 'item');
  score({ sqlite: desktop.db, id: desktop.name }, 'first', '2026-09-01T00:00:00.000Z');
  score({ sqlite: desktop.db, id: desktop.name }, 'second', '2026-09-08T00:00:00.000Z');
  await sync(desktop, mobile);
});
afterEach(closeLibraries);

it('preserves an edited current question, then removes its remotely graded item from the durable receiving list', async () => {
  const local = await openDailyFlow(desktop.port, { now, mode: 'review-first' }, settings(desktop), persistence(desktop));
  const initial = await openDailyFlow(mobile.port, { now, mode: 'review-first' }, settings(mobile), persistence(mobile));
  expect(initial.session.currentNodeId).toBe('topic');
  edit(desktop, 'Corrected question', 'Card', null, 'item');
  await sync(desktop, mobile);
  const edited = await openDailyFlow(mobile.port, { now, mode: 'review-first' }, settings(mobile), persistence(mobile));
  expect(edited.session.currentNodeId).toBe('topic');
  expect(edited.session.queueNodeIds).toEqual(initial.session.queueNodeIds);
  const before = desktop.driver.queryOne<{ due: string; last_review_at: string | null; state: 0 | 1 | 2 | 3;
    stability: number; difficulty: number; elapsed_days: number; scheduled_days: number; reps: number; lapses: number }>(
    "SELECT * FROM node_review WHERE node_id='topic'")!;
  const cardBefore = { ...before, last_review: before.last_review_at };
  const cardAfter = createFsrsReviewScheduler({ loadSettings: () => DEFAULT_REVIEW_SCHEDULER_SETTINGS,
    getSettingsVersion: getReviewSchedulerVersion, createParameters: createReviewSchedulerParameters })
    .grade({ card: cardBefore, rating: 'Good', now }).card;
  const snapshot = (await persistence(desktop).snapshot(desktop.port)).nodesById.topic!;
  await commitDailyFlow(desktop.port, { opId: 'daily-score', now, token: local.session.daily!,
    sourceSession: local.session, grade: { nodeId: 'topic', before: snapshot.review, grade: 3,
      reviewedAt: now, schedulerVersion: 'test', cardBefore, cardAfter } }, settings(desktop), persistence(desktop));
  await sync(desktop, mobile);
  await sync(mobile, desktop);
  const received = await openDailyFlow(mobile.port, { now, mode: 'review-first' }, settings(mobile), persistence(mobile));
  expect(received.session.currentNodeId).toBeNull();
  expect(received.session.queueNodeIds).toEqual([]);
  expect((await readDailyFlow(mobile.port))!.session).toEqual(received.session);
  const facts = desktop.db.prepare('SELECT op_id, grade, kind, reviewed_at FROM review_log ORDER BY op_id').all();
  for (const peer of [desktop, mobile]) {
    const reopened = new Database(peer.file, { readonly: true });
    try {
      expect(reopened.prepare("SELECT title FROM nodes WHERE id='topic'").get()).toEqual({ title: 'Card' });
      expect(reopened.prepare('SELECT op_id, grade, kind, reviewed_at FROM review_log ORDER BY op_id').all()).toEqual(facts);
      expect(reopened.prepare("SELECT reps FROM node_review WHERE node_id='topic'").get()).toEqual({ reps: 3 });
    } finally { reopened.close(); }
  }
  assertPersisted(desktop, 'Corrected question');
  assertPersisted(mobile, 'Corrected question');
});

it('rejects another library cursor even when its day and numeric revision match', async () => {
  const source = await openDailyFlow(desktop.port, { now, mode: 'review-first' }, settings(desktop), persistence(desktop));
  const target = await openDailyFlow(mobile.port, { now, mode: 'review-first' }, settings(mobile), persistence(mobile));
  expect(source.session.daily!.revision).toBe(target.session.daily!.revision);
  await expect(commitDailyFlow(mobile.port, { opId: 'wrong-library', now, token: source.session.daily!,
    nextSession: source.session }, settings(mobile), persistence(mobile))).rejects.toThrow('daily_flow_library_changed');
  expect((await readDailyFlow(mobile.port))!.session).toEqual(target.session);
  expect(mobile.db.prepare('SELECT * FROM daily_flow_operations').all()).toEqual([]);
});
