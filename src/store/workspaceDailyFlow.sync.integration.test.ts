// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver';
import { score } from '../../electron/database/reviewProjection.testSupport';
import { assertPersisted, closeLibraries, createPeer, edit, joinPeers, startLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { syncRequestLibrary as sync } from '../../electron/database/syncRequestLibrary.testSupport';
import { softDeleteNodes } from '../../lib/core/database/nodeMutations';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState';
import { saveNodeReviewStateWithSync } from '../../lib/core/database/nodeReviewSyncState';
import { applyReviewGrade } from '../../lib/core/database/reviewMutations';
import { hashTextBody } from '../../lib/core/database/textBodyHash';
import { dailyFlowHistoryCommand } from '../../lib/core/flow/dailyFlowHistory';
import { commitDailyFlow, openDailyFlow, type DailyFlowPersistence } from '../../lib/core/flow/dailyFlowService';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession';
import { readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { compactFlowHistoryEntry, restoreFlowHistoryEntry } from '../../lib/core/flow/flowHistoryEntry';
import { createFsrsReviewScheduler } from '../../lib/core/review/fsrsScheduler';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, createReviewSchedulerParameters, getReviewSchedulerVersion } from '../../lib/core/review/settings';
import { readCompanionReviewTopic, postponeCompanionReviewTopic, dismissCompanionReviewTopic } from '../companion/companionReadingReview';
import { companionDailyFlowPersistence } from '../shared/platform/companion/runtime/companionDailyFlow';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { createTopicDismissHistoryEntry } from './workspaceTopicDismissActionHistory';

let desktop: Peer;
let mobile: Peer;
const now = '2026-10-03T00:00:00.000Z';
function settings(peer: Peer) {
  return { scope: hashTextBody(peer.file), newDayStartsAtHour: 4, pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue };
}
function persistence(peer: Peer): DailyFlowPersistence {
  return {
    learningSnapshot: companionDailyFlowPersistence.learningSnapshot,
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

it('removes a waiting Soon after a remote deletion and persists both independent libraries', async () => {
  edit(desktop, 'Reading body', 'Reading', null, 'topic');
  await sync(desktop, mobile);
  const initial = await openDailyFlow(mobile.port, { now, mode: 'reading-only' }, settings(mobile), persistence(mobile));
  await commitDailyFlow(mobile.port, { opId: 'soon-local', now, token: initial.session.daily!,
    sourceSession: initial.session, readingAction: 'soon', readings: [{ nodeId: 'topic', before: null, after: null }] },
  settings(mobile), persistence(mobile));
  const deletedAt = '2026-10-03T00:01:00.000Z';
  softDeleteNodes(desktop.driver, { nodeIds: ['topic'], deletedAt });
  desktop.driver.execute("UPDATE nodes SET sync_dirty=1, last_modified_by_host_name=? WHERE id='topic'", [desktop.name]);
  flushNodeSyncVersionWithDriver(desktop.driver, 'topic', desktop.name, deletedAt);
  await sync(desktop, mobile);
  expect(mobile.db.prepare("SELECT deleted_at FROM nodes WHERE id='topic'").get()).toEqual({ deleted_at: deletedAt });
  const received = await openDailyFlow(mobile.port, { now: deletedAt, mode: 'reading-only' }, settings(mobile), persistence(mobile));
  expect(received.session.currentNodeId).toBeNull();
  expect(received.session.queueNodeIds).toEqual([]);
  expect(received.session.soonNodeIds).toEqual([]);
  expect((await readDailyFlow(mobile.port))!.session).toEqual(received.session);
  for (const peer of [desktop, mobile]) {
    const reopened = new Database(peer.file, { readonly: true });
    try { expect(reopened.prepare("SELECT deleted_at FROM nodes WHERE id='topic'").get()).toEqual({ deleted_at: deletedAt }); }
    finally { reopened.close(); }
  }
});

it.each(['read', 'later', 'dismiss'] as const)('synchronizes %s facts between independent lists without overwriting concurrent content', async action => {
  edit(desktop, 'Reading body', 'Reading', null, 'topic');
  await sync(desktop, mobile);
  const source = await openDailyFlow(mobile.port, { now, mode: 'reading-only' }, settings(mobile), persistence(mobile));
  const initial = (await loadIosCompanionWorkspaceSnapshot(mobile.port))!;
  const mutate = { read: readCompanionReviewTopic, later: postponeCompanionReviewTopic, dismiss: dismissCompanionReviewTopic }[action];
  const changed = mutate({ nodeId: 'topic', now, snapshot: initial })!;
  edit(desktop, 'Concurrent content edit', 'Reading', null, 'topic');
  await sync(desktop, mobile);
  const result = await commitDailyFlow(mobile.port, { opId: `reading-${action}`, now, token: source.session.daily!,
    sourceSession: source.session, readingAction: action,
    readings: [{ nodeId: 'topic', before: initial.nodesById.topic!.reading,
      after: changed.snapshot.nodesById.topic!.reading }] }, settings(mobile), persistence(mobile));
  expect(result.session.currentNodeId).toBeNull();
  await sync(mobile, desktop);
  await sync(desktop, mobile);
  const received = await openDailyFlow(desktop.port, { now, mode: 'reading-only' }, settings(desktop), persistence(desktop));
  expect(received.session.currentNodeId).toBeNull();
  const reading = mobile.db.prepare("SELECT * FROM node_reading WHERE node_id='topic'").get();
  for (const peer of [desktop, mobile]) {
    const reopened = new Database(peer.file, { readonly: true });
    try {
      expect(reopened.prepare("SELECT * FROM node_reading WHERE node_id='topic'").get()).toEqual(reading);
    } finally { reopened.close(); }
    assertPersisted(peer, 'Concurrent content edit');
    expect((await readDailyFlow(peer.port))!.session.currentNodeId).toBeNull();
  }
});

it.each(['read', 'later', 'dismiss'] as const)('synchronizes delta %s undo/redo and rejects a later remote deletion atomically', async action => {
  edit(desktop, 'Reading body', 'Reading', null, 'topic');
  await sync(desktop, mobile);
  const source = await openDailyFlow(mobile.port, { now, mode: 'reading-only' }, settings(mobile), persistence(mobile));
  const initial = (await loadIosCompanionWorkspaceSnapshot(mobile.port))!;
  const mutate = { read: readCompanionReviewTopic, later: postponeCompanionReviewTopic, dismiss: dismissCompanionReviewTopic }[action];
  const changed = mutate({ nodeId: 'topic', now, snapshot: initial })!;
  const afterReading = changed.snapshot.nodesById.topic!.reading;
  const result = await commitDailyFlow(mobile.port, { opId: `delta-${action}`, now, token: source.session.daily!,
    sourceSession: source.session, readingAction: action, readings: [{ nodeId: 'topic',
      before: initial.nodesById.topic!.reading, after: afterReading }] }, settings(mobile), persistence(mobile));
  const context = (reviewSession: DailyFlowSession) => ({ activeNodeId: reviewSession.currentNodeId,
    browseRootNodeId: '', reviewSession });
  const entry = compactFlowHistoryEntry(createTopicDismissHistoryEntry({ id: `delta-${action}`, nodeId: 'topic',
    mutationTimestamp: now, beforeContext: context(source.session), afterContext: context(result.session),
    beforeReading: initial.nodesById.topic!.reading, afterReading }));
  edit(desktop, 'Edited during history replay', 'Reading', null, 'topic');
  await sync(desktop, mobile);
  const undo = await commitDailyFlow(mobile.port, dailyFlowHistoryCommand({ session: result.session,
    entry: restoreFlowHistoryEntry(entry, result.session), mode: 'undo', now }), settings(mobile), persistence(mobile));
  await sync(mobile, desktop);
  await sync(desktop, mobile);
  for (const peer of [desktop, mobile]) {
    const reader = new Database(peer.file, { readonly: true });
    try { expect(reader.prepare("SELECT * FROM node_reading WHERE node_id='topic'").get()).toBeUndefined(); }
    finally { reader.close(); }
    assertPersisted(peer, 'Edited during history replay');
  }
  const redo = await commitDailyFlow(mobile.port, dailyFlowHistoryCommand({ session: undo.session,
    entry: restoreFlowHistoryEntry(entry, undo.session), mode: 'redo', now }), settings(mobile), persistence(mobile));
  await sync(mobile, desktop);
  const deletedAt = '2026-10-03T00:01:00.000Z';
  softDeleteNodes(desktop.driver, { nodeIds: ['topic'], deletedAt });
  desktop.driver.execute("UPDATE nodes SET sync_dirty=1, last_modified_by_host_name=? WHERE id='topic'", [desktop.name]);
  flushNodeSyncVersionWithDriver(desktop.driver, 'topic', desktop.name, deletedAt);
  await sync(desktop, mobile);
  const stored = await readDailyFlow(mobile.port);
  const reading = mobile.db.prepare("SELECT * FROM node_reading WHERE node_id='topic'").get();
  await expect(commitDailyFlow(mobile.port, dailyFlowHistoryCommand({ session: redo.session,
    entry: restoreFlowHistoryEntry(entry, redo.session), mode: 'undo', now: deletedAt }), settings(mobile), persistence(mobile)))
    .rejects.toThrow('daily_flow_learning_changed');
  expect(await readDailyFlow(mobile.port)).toEqual(stored);
  expect(mobile.db.prepare("SELECT * FROM node_reading WHERE node_id='topic'").get()).toEqual(reading);
});
