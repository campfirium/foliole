// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { companionDailyFlowPersistence, openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { commitCompanionFlowHistory, loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { saveIosReadingWithDb } from '../shared/platform/companion/runtime/iosCompanionActiveDatabaseWrites';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { toReadingPayload } from '../shared/platform/companionSyncStateWriters';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import type { ReviewSessionState } from '../store/workspaceStoreTypes';

import { createCompanionFlowHistoryEntry } from './companionFlowHistoryEntry';
import { persistFlowMutation } from './companionFlowMutation';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

const now = '2026-10-26T08:00:00.000Z';
const key = 'flow_history:daily-reading';
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let session: ReviewSessionState;
const snapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
beforeEach(async () => {
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
  library = await createSearchLibrary(0);
  const records = await Promise.all(Array.from({ length: 8 }, (_, i) => toWorkspaceNativeNodeVersion({
    id: `node-${i}`, title: `Node ${i}`, content: `Content ${i}`, kind: 'topic',
    parentNodeId: null, reveal: null, anchorLink: null,
    isTitleManual: true, hideTitleHeading: false, reading: null, review: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: now }, 'remote', `base-${i}`)));
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, records, { enqueueSearchInvalidations: false }));
  session = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
});
afterEach(async () => { vi.restoreAllMocks(); await library.close(); });

async function act(action: 'read' | 'later' | 'dismiss', stamp = now, initial?: Awaited<ReturnType<typeof snapshot>>) {
  return persistFlowMutation({ action, nodeId: session.currentNodeId!, now: stamp,
    snapshot: initial ?? await snapshot(), history: { key, mode: 'recommended', session } });
}

async function reopen() {
  await closeIosCompanionDatabase();
  const database = new Database(path.join(library.root, 'library.db'));
  await initializeIosCompanionDatabase({ booted_at: now, database_path: null, database_ready: false,
    host_name: 'Search', runtime_kind: 'android-capacitor' }, createFakeCapacitorDatabaseManager(database, true, () => {}));
}

it.each(['read', 'later', 'dismiss'] as const)('%s reads locally and restores mobile history after reopening the database', async action => {
  const before = structuredClone(session);
  const reads = vi.spyOn(companionDailyFlowPersistence, 'snapshot');
  session = (await act(action)).session!;
  const after = structuredClone(session);
  expect(after.currentNodeId).toBe(before.queueNodeIds[1]);
  expect(after.cycle?.remaining).toBe(before.cycle!.remaining - 1);
  expect(reads.mock.calls.every(call => call[1] !== undefined && call[1].length <= 32)).toBe(true);
  const reading = (await snapshot()).nodesById[before.currentNodeId!]!.reading;
  await reopen();
  session = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
  expect(session.queueNodeIds).toEqual(after.queueNodeIds);
  expect((await loadCompanionFlowHistory(key)).undoStack).toHaveLength(1);
  session = (await replayCompanionFlowHistory(key, 'undo', session))!;
  expect(session.currentNodeId).toBe(before.currentNodeId);
  expect((await snapshot()).nodesById[before.currentNodeId!]!.reading).toBeNull();
  session = (await replayCompanionFlowHistory(key, 'redo', session))!;
  expect(session.queueNodeIds).toEqual(after.queueNodeIds);
  expect((await snapshot()).nodesById[before.currentNodeId!]!.reading).toEqual(reading);
});

it.each(['read', 'later', 'dismiss'] as const)('%s commits facts, daily progress and mobile history atomically and deduplicates a lost receipt', async action => {
  const before = structuredClone(session);
  const initial = await snapshot();
  library.database.exec("CREATE TRIGGER reject_daily BEFORE INSERT ON daily_flow_operations BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  await expect(act(action, now, initial)).rejects.toThrow();
  expect((await snapshot()).nodesById[before.currentNodeId!]!.reading).toBeNull();
  expect((await loadCompanionFlowHistory(key)).undoStack).toEqual([]);
  expect((await openCompanionDailyFlow({ now, mode: 'recommended' })).session).toEqual(before);
  library.database.exec('DROP TRIGGER reject_daily');
  const commit = library.connection.commitTransaction.bind(library.connection);
  vi.spyOn(library.connection, 'commitTransaction').mockImplementationOnce(async () => {
    await commit();
    throw new Error('commit_receipt_lost');
  });
  await expect(act(action, now, initial)).rejects.toThrow();
  const committed = (await snapshot()).nodesById[before.currentNodeId!]!.reading;
  session = (await act(action, '2026-10-26T08:01:00.000Z', initial)).session!;
  expect((await snapshot()).nodesById[before.currentNodeId!]!.reading).toEqual(committed);
  expect((await loadCompanionFlowHistory(key)).undoStack).toHaveLength(1);
  expect(library.database.prepare('SELECT * FROM daily_flow_operations').all()).toHaveLength(1);
  expect(session.currentNodeId).toBe(before.queueNodeIds[1]);
  expect(session.readTopicCount).toBe((before.readTopicCount ?? 0) + 1);
});

it.each(['read', 'later', 'dismiss'] as const)('%s rejects a stale target and preserves an unrelated external edit', async action => {
  const initial = await snapshot();
  const target = session.currentNodeId!;
  library.database.prepare("UPDATE nodes SET title='Concurrent edit' WHERE id=?").run(session.queueNodeIds[1]!);
  library.database.prepare('UPDATE nodes SET deleted_at=? WHERE id=?').run(now, target);
  await expect(act(action, now, initial)).rejects.toThrow('daily_flow_learning_changed');
  expect((await snapshot()).nodesById[target]!.reading).toBeNull();
  expect((await loadCompanionFlowHistory(key)).undoStack).toEqual([]);
  session = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
  expect(session.queueNodeIds).not.toContain(target);
  session = (await act(action)).session!;
  expect((await snapshot()).nodesById[initial.nodeOrder.find(id => id !== target)!]!.title).toBeDefined();
  await reopen();
  const disk = await snapshot();
  expect(Object.values(disk.nodesById).some(node => node.title === 'Concurrent edit')).toBe(true);
  expect((await openCompanionDailyFlow({ now, mode: 'recommended' })).session.queueNodeIds).toEqual(session.queueNodeIds);
});

it.each(['read', 'later'] as const)('%s uses the configured short interval and retains the traversal before revisiting the due topic', async action => {
  const target = session.currentNodeId!;
  const previous = { intervalDurationMs: 60000, intervalGrowthFactor: 4, lastHandledAt: now,
    nextAt: now, priority: 9, readingPosition: 0, repetitionCount: 1, state: 'active' as const };
  await writeIosCompanionDatabase(db => saveIosReadingWithDb(db, { node_id: target, reading_json: JSON.stringify(toReadingPayload(previous)) }));
  hydrateCurrentReviewSchedulerSettings({ ...DEFAULT_REVIEW_SCHEDULER_SETTINGS, pushQueue: {
    ...DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue, readingInitialIntervalMs: 60000,
    readingIntervalGrowthFactorRange: { min: 4, max: 4 } } });
  session = (await openCompanionDailyFlow({ now, mode: 'reading-only', preferredNodeId: target })).session;
  expect(session.currentNodeId).toBe(target);
  session = (await act(action)).session!;
  const reading = (await snapshot()).nodesById[target]!.reading!;
  expect(reading.intervalDurationMs).toBe(action === 'read' ? 240000 : 120000);
  const queued = (library.database.prepare('SELECT node_id FROM daily_flow_entries WHERE active=1 AND initial_task=1 ORDER BY order_key').all() as { node_id: string }[]).map(row => row.node_id);
  for (const id of queued) {
    expect(session.currentNodeId).toBe(id);
    const state = await snapshot();
    const saved = await commitCompanionFlowHistory({ key, mode: 'reading-only', entry: createCompanionFlowHistoryEntry({
      action: 'soon', nodeId: id, now, before: state, after: state, history: { key, mode: 'reading-only', session } }) });
    if (typeof saved !== 'object' || !('session' in saved)) throw new Error('missing_session');
    session = saved.session;
  }
  for (const id of queued) {
    expect(session.currentNodeId).toBe(id);
    session = (await act('read', reading.nextAt)).session!;
  }
  expect(session.currentNodeId).toBe(target);
  await reopen();
  expect((await openCompanionDailyFlow({ now: reading.nextAt, mode: 'reading-only' })).session.currentNodeId).toBe(target);
});

it('Dismiss releases the related sequential topic and restores both facts with persisted mobile history', async () => {
  const first = 'node-0';
  const second = 'node-1';
  const source = await toWorkspaceNativeNodeVersion({ id: 'source', title: 'Source', content: '', kind: 'folder',
    parentNodeId: null, reveal: null, anchorLink: null, isTitleManual: true, hideTitleHeading: false,
    reading: null, review: null, sequentialReadingEnabled: true, createdAt: now, updatedAt: now }, 'remote', 'source');
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [source], { enqueueSearchInvalidations: false }));
  library.database.prepare("UPDATE nodes SET shelved_at=? WHERE id NOT IN ('node-0','node-1','source')").run(now);
  library.database.prepare('UPDATE nodes SET parent_id=? WHERE id IN (?,?)').run('source', first, second);
  const locked = { intervalDurationMs: 60000, intervalGrowthFactor: 2, lastHandledAt: now,
    nextAt: now, priority: 9, readingPosition: 0, repetitionCount: 0, state: 'locked' as const };
  await writeIosCompanionDatabase(db => saveIosReadingWithDb(db, { node_id: second, reading_json: JSON.stringify(toReadingPayload(locked)) }));
  session = (await openCompanionDailyFlow({ now, mode: 'reading-only', preferredNodeId: first })).session;
  expect(session.currentNodeId).toBe(first);
  session = (await act('dismiss')).session!;
  expect((await snapshot()).nodesById[second]!.reading!.state).toBe('active');
  expect(session.currentNodeId).toBe(second);
  await reopen();
  session = (await openCompanionDailyFlow({ now, mode: 'reading-only' })).session;
  session = (await replayCompanionFlowHistory(key, 'undo', session))!;
  expect((await snapshot()).nodesById[second]!.reading!.state).toBe('locked');
  expect((await snapshot()).nodesById[first]!.reading).toBeNull();
  session = (await replayCompanionFlowHistory(key, 'redo', session))!;
  expect(session.currentNodeId).toBe(second);
  expect((await snapshot()).nodesById[first]!.reading!.state).toBe('dismissed');
  expect((await snapshot()).nodesById[second]!.reading!.state).toBe('active');
});
