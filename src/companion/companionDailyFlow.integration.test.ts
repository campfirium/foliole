// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { commitCompanionFlowHistory, loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';
import type { ReviewSessionState } from '../store/workspaceStoreTypes';

import { seedCompanionReviewHistory } from './companionFlowHistory.testSupport';
import { createCompanionFlowHistoryEntry } from './companionFlowHistoryEntry';
import { persistFlowMutation } from './companionFlowMutation';
import { gradeCompanionReviewCard } from './companionReviewSession';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

const now = '2026-10-25T08:00:00.000Z';
const key = 'flow_history:daily';
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let session: ReviewSessionState;
const snapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
beforeEach(async () => { library = await createSearchLibrary(0); session = createEmptyReviewSession(); });
afterEach(async () => { await library.close(); });

async function seed() {
  await seedCompanionReviewHistory({ due: '2026-10-01T00:00:00.000Z', lastReviewAt: '2026-09-28T00:00:00.000Z',
    state: 2, stability: 3, difficulty: 4, elapsedDays: 3, scheduledDays: 3, reps: 2, lapses: 0 }, now);
}
async function open(stamp = now) {
  session = (await openCompanionDailyFlow({ now: stamp, mode: 'review-first' })).session;
  return session;
}
async function reopen() {
  await closeIosCompanionDatabase();
  const database = new Database(path.join(library.root, 'library.db'));
  await initializeIosCompanionDatabase({ booted_at: now, database_path: null, database_ready: false,
    host_name: 'Search', runtime_kind: 'android-capacitor' }, createFakeCapacitorDatabaseManager(database, true, () => {}));
}

it('lazily creates an empty daily list and rolls back a rejected first initialization', async () => {
  expect(library.database.prepare('SELECT * FROM daily_flow_state').all()).toEqual([]);
  await seed();
  library.database.exec("CREATE TRIGGER reject_daily BEFORE INSERT ON daily_flow_entries BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  await expect(open()).rejects.toThrow('disk full');
  expect(library.database.prepare('SELECT * FROM daily_flow_state').all()).toEqual([]);
  expect(library.database.prepare('SELECT * FROM daily_flow_entries').all()).toEqual([]);
  library.database.exec('DROP TRIGGER reject_daily');
  expect((await open()).queueNodeIds).toHaveLength(3);
});

it('stores the complete daily IDs once, keeps minute items waiting, and preserves order across database reopen', async () => {
  await seed();
  library.database.prepare("UPDATE node_review SET due=?, scheduled_days=0 WHERE node_id='c'").run('2026-10-25T08:10:00.000Z');
  await open();
  expect(session.queueNodeIds).toHaveLength(2);
  expect(session.queueNodeIds).not.toContain('c');
  expect(library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_entries').get()).toEqual({ n: 3 });
  const saved = structuredClone(session);
  expect(await open()).toEqual(saved);
  await reopen();
  expect(await open()).toEqual(saved);
});

it('opens empty libraries and creates a fresh learning-day list without losing overdue items', async () => {
  expect((await open()).queueNodeIds).toEqual([]);
  await seed();
  await open();
  const before = session.daily!.dayKey;
  const ids = session.queueNodeIds;
  await open('2026-10-26T08:00:00.000Z');
  expect(session.daily!.dayKey).not.toBe(before);
  expect(new Set(session.queueNodeIds)).toEqual(new Set(ids));
  expect(library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_state').get()).toEqual({ n: 1 });
});

it('rolls back the grade, daily cursor and mobile undo together, then deduplicates a lost receipt retry', async () => {
  await seed();
  await open();
  session.isAnswerRevealed = true;
  const before = await snapshot();
  const graded = await gradeCompanionReviewCard({ snapshot: before, nodeId: session.currentNodeId!, now, grade: 3 });
  if (!graded) throw new Error('missing_grade');
  const entry = createCompanionFlowHistoryEntry({ action: 'grade', nodeId: session.currentNodeId!, now,
    before, after: graded.snapshot, history: { key, mode: 'review-first', session } });
  const args = { key, mode: 'review-first' as const, entry, reviewLog: graded.reviewLog };
  const facts = library.database.prepare('SELECT * FROM review_log ORDER BY op_id').all();
  const daily = library.database.prepare('SELECT * FROM daily_flow_state').get();
  library.database.exec("CREATE TRIGGER reject_daily BEFORE UPDATE ON daily_flow_state BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  await expect(commitCompanionFlowHistory(args)).rejects.toThrow('disk full');
  expect(library.database.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(facts);
  expect(library.database.prepare('SELECT * FROM daily_flow_state').get()).toEqual(daily);
  expect((await loadCompanionFlowHistory(key)).undoStack).toEqual([]);
  library.database.exec('DROP TRIGGER reject_daily');
  const first = await commitCompanionFlowHistory(args);
  const retry = await commitCompanionFlowHistory(args);
  expect(typeof first).toBe('object');
  expect(typeof retry).toBe('object');
  expect((await loadCompanionFlowHistory(key)).undoStack).toHaveLength(1);
  expect(library.database.prepare('SELECT COUNT(*) AS n FROM review_log WHERE op_id=?').get(entry.id)).toEqual({ n: 1 });
});

it('restores the committed grade and daily cursor through undo, redo and database restart', async () => {
  await seed();
  await open();
  session.isAnswerRevealed = true;
  const before = structuredClone(session);
  const result = await persistFlowMutation({ action: 'grade', grade: 3, nodeId: session.currentNodeId!,
    now, snapshot: await snapshot(), history: { key, mode: 'review-first', session } });
  expect(result.session?.daily).toBeDefined();
  session = result.session!;
  const after = structuredClone(session);
  const target = before.currentNodeId!;
  expect((await snapshot()).nodesById[target]?.review?.reps).toBe(3);
  session = (await replayCompanionFlowHistory(key, 'undo', session))!;
  expect(session.currentNodeId).toBe(target);
  expect((await snapshot()).nodesById[target]?.review?.reps).toBe(2);
  session = (await replayCompanionFlowHistory(key, 'redo', session))!;
  expect(session.queueNodeIds).toEqual(after.queueNodeIds);
  expect((await snapshot()).nodesById[target]?.review?.reps).toBe(3);
  const saved = structuredClone(session);
  await reopen();
  expect((await open()).queueNodeIds).toEqual(saved.queueNodeIds);
  expect((await loadCompanionFlowHistory(key)).undoStack).toHaveLength(1);
  expect((await snapshot()).nodesById[target]?.review?.reps).toBe(3);
});

it.each(['read', 'later', 'dismiss', 'soon'] as const)('persists %s, undo and redo in the same daily list', async action => {
  await seed();
  library.database.exec("UPDATE nodes SET kind='topic', reveal=NULL");
  session = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
  const before = structuredClone(session);
  const initial = await snapshot();
  const target = session.currentNodeId!;
  if (action === 'soon') {
    const result = await commitCompanionFlowHistory({ key, mode: 'recommended', entry: createCompanionFlowHistoryEntry({
      action, nodeId: target, now, before: initial, after: initial, history: { key, mode: 'recommended', session } }) });
    if (typeof result !== 'object' || !('session' in result)) throw new Error('missing_daily_session');
    session = result.session;
    expect(library.database.prepare('SELECT * FROM node_reading').all()).toEqual([]);
  } else {
    const result = await persistFlowMutation({ action, nodeId: target, now, snapshot: initial,
      history: { key, mode: 'recommended', session } });
    session = result.session!;
  }
  const after = structuredClone(session);
  const afterReading = (await snapshot()).nodesById[target]?.reading ?? null;
  expect(after.daily!.revision).toBeGreaterThan(before.daily!.revision);
  expect(after.currentNodeId).not.toBe(target);
  session = (await replayCompanionFlowHistory(key, 'undo', session))!;
  expect(session.currentNodeId).toBe(target);
  expect((await snapshot()).nodesById[target]?.reading ?? null).toEqual(initial.nodesById[target]?.reading ?? null);
  session = (await replayCompanionFlowHistory(key, 'redo', session))!;
  expect(session.currentNodeId).toBe(after.currentNodeId);
  expect((await snapshot()).nodesById[target]?.reading ?? null).toEqual(afterReading);
  await reopen();
  const restored = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
  expect(restored.currentNodeId).toBe(after.currentNodeId);
  expect(restored.queueNodeIds).toEqual(after.queueNodeIds);
  expect(restored.soonNodeIds).toEqual(after.soonNodeIds);
  expect((await snapshot()).nodesById[target]?.reading ?? null).toEqual(afterReading);
});

it('keeps a saved grade when it is recomputed for a later retry after its original receipt was lost', async () => {
  await seed();
  await open();
  const target = session.currentNodeId!;
  session.isAnswerRevealed = true;
  const initial = await snapshot();
  const firstGrade = await gradeCompanionReviewCard({ nodeId: target, snapshot: initial, grade: 3, now });
  if (!firstGrade) throw new Error('missing_grade');
  const history = { key, mode: 'review-first' as const, session };
  const firstEntry = createCompanionFlowHistoryEntry({ action: 'grade', grade: 3, nodeId: target, now,
    before: initial, after: firstGrade.snapshot, history });
  const commit = library.connection.commitTransaction.bind(library.connection);
  vi.spyOn(library.connection, 'commitTransaction').mockImplementationOnce(async () => {
    await commit();
    throw new Error('commit_receipt_lost');
  });
  await expect(commitCompanionFlowHistory({ key, mode: history.mode, entry: firstEntry,
    reviewLog: firstGrade.reviewLog })).rejects.toThrow();
  const committed = (await snapshot()).nodesById[target]!.review;
  expect(committed?.reps).toBe(3);
  const later = '2026-10-25T08:00:30.000Z';
  const retryGrade = await gradeCompanionReviewCard({ nodeId: target, snapshot: initial, grade: 3, now: later });
  if (!retryGrade) throw new Error('missing_retry_grade');
  const retryEntry = createCompanionFlowHistoryEntry({ action: 'grade', grade: 3, nodeId: target, now: later,
    before: initial, after: retryGrade.snapshot, history });
  expect(retryEntry.id).toBe(firstEntry.id);
  const retry = await commitCompanionFlowHistory({ key, mode: history.mode, entry: retryEntry, reviewLog: retryGrade.reviewLog });
  expect(typeof retry === 'object' && retry.card?.reps).toBe(3);
  expect((await snapshot()).nodesById[target]!.review).toEqual(committed);
  expect(library.database.prepare('SELECT COUNT(*) AS n FROM review_log WHERE op_id=?').get(firstEntry.id)).toEqual({ n: 1 });
  expect((await loadCompanionFlowHistory(key)).undoStack).toHaveLength(1);
});

it('keeps the minute item waiting after Queue Clear and makes it available on a later review entry', async () => {
  await seed();
  library.database.prepare("UPDATE node_review SET due=?, scheduled_days=0 WHERE node_id='c'").run('2026-10-25T08:10:00.000Z');
  await open();
  for (let index = 0; index < 2; index += 1) {
    session.isAnswerRevealed = true;
    const result = await persistFlowMutation({ action: 'grade', grade: 3, nodeId: session.currentNodeId!,
      now, snapshot: await snapshot(), history: { key, mode: 'review-first', session } });
    session = result.session!;
  }
  expect(session.currentNodeId).toBeNull();
  expect((await open('2026-10-25T08:05:00.000Z')).currentNodeId).toBeNull();
  expect((await open('2026-10-25T08:10:00.000Z')).currentNodeId).toBe('c');
});
