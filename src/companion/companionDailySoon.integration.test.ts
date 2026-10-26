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
  session = (await openCompanionDailyFlow({ now: stamp, mode: 'reading-only' })).session;
  return session;
}
async function reopen() {
  await closeIosCompanionDatabase();
  const database = new Database(path.join(library.root, 'library.db'));
  await initializeIosCompanionDatabase({ booted_at: now, database_path: null, database_ready: false,
    host_name: 'Search', runtime_kind: 'android-capacitor' }, createFakeCapacitorDatabaseManager(database, true, () => {}));
}

async function topics() {
  await seed();
  library.database.exec("UPDATE nodes SET kind='topic', reveal=NULL");
  library.database.prepare("UPDATE nodes SET created_at=? WHERE id='c'").run('2026-10-25T08:01:00.000Z');
  await open();
}
async function soon(stamp = now) {
  const initial = await snapshot();
  const result = await commitCompanionFlowHistory({ key, mode: 'reading-only', entry: createCompanionFlowHistoryEntry({
    action: 'soon', nodeId: session.currentNodeId!, now: stamp, before: initial, after: initial,
    history: { key, mode: 'reading-only', session } }) });
  if (typeof result !== 'object' || !('session' in result)) throw new Error('missing_daily_session');
  session = result.session;
}
const later = '2026-10-25T08:02:00.000Z';

it.each(['read', 'later', 'dismiss'] as const)('keeps multiple Soon before newly due reading after %s and restores mobile history', async action => {
  await topics();
  const [first, second] = session.queueNodeIds;
  expect(session.queueNodeIds).toHaveLength(2);
  await soon();
  await soon();
  expect(session.currentNodeId).toBe(first);
  expect(session.queueNodeIds).toEqual([]);
  expect(session.readTopicCount).toBe(2);
  const result = await persistFlowMutation({ action, nodeId: session.currentNodeId!, now: later,
    snapshot: await snapshot(), history: { key, mode: 'reading-only', session } });
  session = result.session!;
  expect(session.currentNodeId).toBe(second);
  expect(session.queueNodeIds).toEqual([]);
  expect(session.readTopicCount).toBe(2);
  await reopen();
  expect((await open(later)).currentNodeId).toBe(second);
  session = (await replayCompanionFlowHistory(key, 'undo', session))!;
  expect(session.currentNodeId).toBe(first);
  session = (await replayCompanionFlowHistory(key, 'redo', session))!;
  expect(session.currentNodeId).toBe(second);
  expect((await loadCompanionFlowHistory(key)).undoStack).toHaveLength(3);
});

it('keeps repeat Soon unique and does not rewrite unrelated persistent rows', async () => {
  await topics();
  const [first, second] = session.queueNodeIds;
  const remaining = library.database.prepare('SELECT * FROM daily_flow_entries WHERE node_id <> ?').all(first);
  await soon();
  expect(library.database.prepare('SELECT * FROM daily_flow_entries WHERE node_id <> ?').all(first)).toEqual(remaining);
  await soon();
  expect(session.currentNodeId).toBe(first);
  await soon();
  expect(session.currentNodeId).toBe(second);
  expect(session.soonNodeIds).toEqual([first]);
  expect(session.readTopicCount).toBe(2);
  expect(library.database.prepare('SELECT * FROM node_reading').all()).toEqual([]);
  await reopen();
  expect((await open()).soonNodeIds).toEqual([first]);
});

it('rolls back Soon and its mobile history together, then deduplicates a committed retry', async () => {
  await topics();
  const before = structuredClone(session);
  const initial = await snapshot();
  const entry = createCompanionFlowHistoryEntry({ action: 'soon', nodeId: session.currentNodeId!, now,
    before: initial, after: initial, history: { key, mode: 'reading-only', session } });
  const args = { key, mode: 'reading-only' as const, entry };
  library.database.exec("CREATE TRIGGER reject_soon BEFORE UPDATE ON daily_flow_state BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  await expect(commitCompanionFlowHistory(args)).rejects.toThrow('disk full');
  expect(await open()).toEqual(before);
  expect((await loadCompanionFlowHistory(key)).undoStack).toEqual([]);
  library.database.exec('DROP TRIGGER reject_soon');
  const commit = library.connection.commitTransaction.bind(library.connection);
  vi.spyOn(library.connection, 'commitTransaction').mockImplementationOnce(async () => {
    await commit();
    throw new Error('commit_receipt_lost');
  });
  await expect(commitCompanionFlowHistory(args)).rejects.toThrow();
  const retry = await commitCompanionFlowHistory(args);
  if (typeof retry !== 'object' || !('session' in retry)) throw new Error('missing_daily_session');
  session = retry.session;
  expect(session.soonNodeIds).toEqual([before.currentNodeId]);
  expect(session.readTopicCount).toBe(1);
  expect((await loadCompanionFlowHistory(key)).undoStack).toHaveLength(1);
  expect(library.database.prepare('SELECT * FROM daily_flow_operations').all()).toHaveLength(1);
});

it('does not restore yesterday list through a stale mobile Soon undo after a new day', async () => {
  await topics();
  await soon();
  session = (await openCompanionDailyFlow({ now: '2026-10-26T08:00:00.000Z', mode: 'reading-only' })).session;
  const before = structuredClone(session);
  await expect(replayCompanionFlowHistory(key, 'undo', session)).rejects.toThrow('flow_history_changed');
  expect((await openCompanionDailyFlow({ now: '2026-10-26T08:00:00.000Z', mode: 'reading-only' })).session).toEqual(before);
});

it('keeps mixed minute and day reviews due at their own time while Soon waits after Queue', async () => {
  await seed();
  library.database.exec("UPDATE nodes SET kind='topic', reveal=NULL WHERE id='a'");
  library.database.prepare("UPDATE node_review SET due=?, scheduled_days=0 WHERE node_id='c'").run('2026-10-25T08:10:00.000Z');
  await open();
  expect(session.currentNodeId).toBe('a');
  await soon();
  session = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
  const initial = await snapshot();
  const result = await commitCompanionFlowHistory({ key, mode: 'recommended', entry: createCompanionFlowHistoryEntry({
    action: 'soon', nodeId: 'a', now, before: initial, after: initial,
    history: { key, mode: 'recommended', session } }) });
  if (typeof result !== 'object' || !('session' in result)) throw new Error('missing_daily_session');
  session = result.session;
  expect(session.currentNodeId).toBe('b');
  expect(session.queueNodeIds).not.toContain('c');
  session.isAnswerRevealed = true;
  session = (await persistFlowMutation({ action: 'grade', grade: 3, nodeId: 'b', now,
    snapshot: await snapshot(), history: { key, mode: 'recommended', session } })).session!;
  expect(session.currentNodeId).toBe('a');
  expect(session.queueNodeIds).toEqual([]);
  expect((await openCompanionDailyFlow({ now: '2026-10-25T08:05:00.000Z', mode: 'review-first' })).session.currentNodeId).toBeNull();
  expect((await openCompanionDailyFlow({ now: '2026-10-25T08:10:00.000Z', mode: 'review-first' })).session.currentNodeId).toBe('c');
});

it('keeps ordinary Soon reads limited to the current and next topic while preserving durable progress', async () => {
  await topics();
  const before = structuredClone(session);
  const { companionDailyFlowPersistence } = await import('../shared/platform/companion/runtime/companionDailyFlow');
  const reads = vi.spyOn(companionDailyFlowPersistence, 'snapshot');
  try {
    await soon();
    expect(session.currentNodeId).toBe(before.queueNodeIds[1]);
    expect(session.soonNodeIds).toEqual([before.currentNodeId]);
    expect(session.readTopicCount).toBe(1);
    expect(reads.mock.calls.every(call => call[1] !== undefined && call[1].length <= 2)).toBe(true);
    await reopen();
    expect((await open()).soonNodeIds).toEqual([before.currentNodeId]);
  } finally { reads.mockRestore(); }
});
