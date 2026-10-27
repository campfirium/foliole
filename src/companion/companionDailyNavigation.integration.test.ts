// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { dailyFlowOperationId } from '../../lib/core/flow/dailyFlowRetry';
import { commitDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { companionWorkspaceSnapshots } from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { companionDailyFlowPersistence, companionDailyFlowSettings, openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { loadCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { readIosCompanionDatabase, writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { loadCompanionReadableArticle, loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import type { ReviewSessionState } from '../store/workspaceStoreTypes';
import { legacyContinuation } from '../test/dailyFlowLegacyContinuation.testSupport';

import { continueCompanionDailyFlow, saveCompanionDailyNavigation } from './companionDailyNavigation';
import { seedCompanionReviewHistory } from './companionFlowHistory.testSupport';
import { persistFlowMutation } from './companionFlowMutation';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

const now = '2026-10-25T08:00:00.000Z';
const later = '2026-10-25T08:00:30.000Z';
const key = 'flow_history:navigation';
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let source: ReviewSessionState;
const snapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
beforeEach(async () => {
  library = await createSearchLibrary(0);
  await seedCompanionReviewHistory({ due: '2026-10-01T00:00:00.000Z', lastReviewAt: '2026-09-28T00:00:00.000Z',
    state: 2, stability: 3, difficulty: 4, elapsedDays: 3, scheduledDays: 3, reps: 2, lapses: 0 }, now);
  library.database.exec("UPDATE nodes SET kind='topic', reveal=NULL WHERE id IN ('a','b')");
  source = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
  expect(source.currentNodeId).toBe('c');
});
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await library.close(); });

async function setupLegacy() {
  source = (await persistFlowMutation({ action: 'grade', grade: 3, nodeId: 'c', now,
    snapshot: await snapshot(), history: { key, mode: 'recommended', session: source } })).session!;
  source = await writeIosCompanionDatabase(db => legacyContinuation(db, source, now));
  expect(source.currentNodeId).toBeNull();
  expect(source.continueNodeId).toBeTruthy();
}

it('legacy compatibility: persists the native mobile continuation once after losing its commit receipt and retains mobile undo across reopening', async () => {
  await setupLegacy();
  const history = await loadCompanionFlowHistory(key);
  const commit = library.connection.commitTransaction.bind(library.connection);
  vi.spyOn(library.connection, 'commitTransaction').mockImplementationOnce(async () => {
    await commit(); throw new Error('commit_receipt_lost');
  });
  await expect(saveCompanionDailyNavigation(source, now)).rejects.toThrow();
  const persisted = await readIosCompanionDatabase(async db => (await readDailyFlow(db))!.session);
  const retry = await saveCompanionDailyNavigation(source, later);
  expect(retry.replayed).toBe(true);
  expect(retry.session).toEqual(persisted);
  expect(retry.session.currentNodeId).toBe(source.continueNodeId);
  expect(retry.session.daily!.revision).toBe(source.daily!.revision + 1);
  const article = await loadCompanionReadableArticle(await snapshot(), source.continueNodeId!);
  expect(article?.content).toBe(source.continueNodeId);
  expect(await loadCompanionFlowHistory(key)).toEqual(history);
  await reopenSearchLibrary(library.root, now);
  expect((await openCompanionDailyFlow({ now, mode: 'recommended' })).session).toEqual(retry.session);
  expect(await loadCompanionFlowHistory(key)).toEqual(history);
});

it('legacy compatibility: rolls back a late navigation failure and retries without modifying history or learning facts', async () => {
  await setupLegacy();
  const daily = library.database.prepare('SELECT * FROM daily_flow_state').get();
  const facts = library.database.prepare('SELECT * FROM review_log ORDER BY op_id').all();
  const history = await loadCompanionFlowHistory(key);
  library.database.exec("CREATE TRIGGER reject_nav BEFORE INSERT ON daily_flow_operations BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  await expect(saveCompanionDailyNavigation(source, now)).rejects.toThrow('disk full');
  expect(library.database.prepare('SELECT * FROM daily_flow_state').get()).toEqual(daily);
  expect(await loadCompanionFlowHistory(key)).toEqual(history);
  library.database.exec('DROP TRIGGER reject_nav');
  const saved = await saveCompanionDailyNavigation(source, later);
  expect(saved.session.currentNodeId).toBe(source.continueNodeId);
  expect(library.database.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(facts);
});

it('legacy compatibility: rejects altered payloads and superseded receipts without a second navigation', async () => {
  await setupLegacy();
  const commit = library.connection.commitTransaction.bind(library.connection);
  vi.spyOn(library.connection, 'commitTransaction').mockImplementationOnce(async () => {
    await commit(); throw new Error('commit_receipt_lost');
  });
  await expect(saveCompanionDailyNavigation(source, now)).rejects.toThrow();
  const args = { opId: dailyFlowOperationId(source.daily!, source.continueNodeId!, 'continue-reading'),
    now: later, token: source.daily!, navigation: 'continue-reading' as const, expectedContinueNodeId: source.continueNodeId! };
  await expect(writeIosCompanionDatabase(db => commitDailyFlow(db, args, companionDailyFlowSettings(),
    companionDailyFlowPersistence))).rejects.toThrow('daily_flow_operation_mismatch');
  await openCompanionDailyFlow({ now, mode: 'recommended', refresh: true });
  const daily = await readIosCompanionDatabase(db => readDailyFlow(db));
  await expect(saveCompanionDailyNavigation(source, later)).rejects.toThrow('daily_flow_ack_superseded');
  expect(await readIosCompanionDatabase(db => readDailyFlow(db))).toEqual(daily);
});

it.each(['day', 'revision', 'library'] as const)('legacy compatibility: rejects a stale %s before advancing the mobile cursor', async conflict => {
  await setupLegacy();
  const stale = structuredClone(source);
  if (conflict === 'revision') stale.daily!.revision -= 1;
  if (conflict === 'library') stale.daily!.scope = 'different-library';
  const daily = await readIosCompanionDatabase(db => readDailyFlow(db));
  await expect(saveCompanionDailyNavigation(stale, conflict === 'day' ? '2026-10-26T08:00:00.000Z' : now))
    .rejects.toThrow(conflict === 'library' ? 'daily_flow_library_changed' : 'daily_flow_changed');
  expect(await readIosCompanionDatabase(db => readDailyFlow(db))).toEqual(daily);
});


it('legacy compatibility: recovers the latest mobile view after a lost receipt is superseded without navigating twice', async () => {
  await setupLegacy();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(now));
  const before = await snapshot();
  const scope = getCompanionReadingScope();
  const current = { identity: 'navigation', scope, session: source, generation: 0, epoch: 0,
    hydrated: true, error: null, kind: null, snapshot: before };
  const owner = { current };
  const args = { snapshot: before, ready: true, active: true, onlyReview: false, libraryScope: library.root };
  const commit = library.connection.commitTransaction.bind(library.connection);
  vi.spyOn(library.connection, 'commitTransaction').mockImplementationOnce(async () => {
    await commit(); throw new Error('commit_receipt_lost');
  });
  await expect(continueCompanionDailyFlow(args, current, owner, 'recommended', () => {})).rejects.toThrow();
  expect(current.session).toBe(source);
  await openCompanionDailyFlow({ now, mode: 'recommended', refresh: true });
  await expect(continueCompanionDailyFlow(args, current, owner, 'recommended', () => {})).rejects.toThrow('daily_flow_ack_superseded');
  expect(current.session.currentNodeId).toBe(source.continueNodeId);
  expect((await readIosCompanionDatabase(db => readDailyFlow(db)))!.session).toEqual(current.session);
});

it('legacy compatibility: merges mobile navigation receipts while retaining concurrent content and guarding a replaced view', async () => {
  await setupLegacy();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(now));
  const before = await snapshot();
  companionWorkspaceSnapshots.reset(before);
  const scope = getCompanionReadingScope();
  const current = { identity: 'navigation', scope, session: source, generation: 0, epoch: 0,
    hydrated: true, error: null, kind: null, snapshot: before };
  const owner = { current };
  const args = { snapshot: before, ready: true, active: true, onlyReview: false, libraryScope: library.root };
  const commit = library.connection.commitTransaction.bind(library.connection);
  vi.spyOn(library.connection, 'commitTransaction').mockImplementationOnce(async () => {
    await commit();
    companionWorkspaceSnapshots.reset({ ...before, nodesById: { ...before.nodesById,
      [source.continueNodeId!]: { ...before.nodesById[source.continueNodeId!]!, content: 'Concurrent content' } } });
  });
  await continueCompanionDailyFlow(args, current, owner, 'recommended', () => {});
  expect(current.session.currentNodeId).toBe(source.continueNodeId);
  expect(companionWorkspaceSnapshots.getSnapshot()!.nodesById[source.continueNodeId!]!.content).toBe('Concurrent content');
  const replacement = { ...current, identity: 'replacement' };
  owner.current = replacement;
  current.session = source;
  await continueCompanionDailyFlow(args, current, owner, 'recommended', () => {});
  expect(current.session).toBe(source);
});

it.each(['rollback', 'lost receipt'] as const)('automatically opens mobile reading after retrying the last grade with %s and restores it after reopening', async failure => {
  const before = await snapshot();
  const historyBefore = await loadCompanionFlowHistory(key);
  const facts = library.database.prepare('SELECT * FROM review_log ORDER BY op_id').all();
  const state = library.database.prepare('SELECT * FROM daily_flow_state').all();
  const rows = library.database.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all();
  const grade = (stamp: string) => persistFlowMutation({ action: 'grade', grade: 3, nodeId: 'c', now: stamp,
    snapshot: before, history: { key, mode: 'recommended', session: source } });
  if (failure === 'rollback') library.database.exec("CREATE TRIGGER reject_auto BEFORE INSERT ON daily_flow_operations BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  else {
    const commit = library.connection.commitTransaction.bind(library.connection);
    vi.spyOn(library.connection, 'commitTransaction').mockImplementationOnce(async () => {
      await commit(); throw new Error('commit_receipt_lost');
    });
  }
  await expect(grade(now)).rejects.toThrow();
  if (failure === 'rollback') {
    expect(library.database.prepare('SELECT * FROM daily_flow_state').all()).toEqual(state);
    expect(library.database.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all()).toEqual(rows);
    expect(library.database.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(facts);
    expect(await loadCompanionFlowHistory(key)).toEqual(historyBefore);
    library.database.exec('DROP TRIGGER reject_auto');
  }
  const committed = library.database.prepare('SELECT * FROM daily_flow_state').all();
  const after = (await grade(later)).session!;
  if (failure === 'lost receipt') expect(library.database.prepare('SELECT * FROM daily_flow_state').all()).toEqual(committed);
  expect(['a', 'b']).toContain(after.currentNodeId);
  expect(after.continueNodeId).toBeNull();
  expect(after.cycle?.clearedAt).toBeTruthy();
  expect(library.database.prepare('SELECT * FROM review_log').all()).toHaveLength(facts.length + 1);
  const history = await loadCompanionFlowHistory(key);
  expect(history?.undoStack).toHaveLength(1);
  await reopenSearchLibrary(library.root, now);
  expect((await openCompanionDailyFlow({ now, mode: 'recommended' })).session).toEqual(after);
  expect(await loadCompanionFlowHistory(key)).toEqual(history);
  expect((await loadCompanionReadableArticle(await snapshot(), after.currentNodeId!))?.content).toBe(after.currentNodeId);
  const advanced = await persistFlowMutation({ action: 'read', nodeId: after.currentNodeId!, now: later,
    snapshot: await snapshot(), history: { key, mode: 'recommended', session: after } });
  expect(advanced.session?.currentNodeId).not.toBe(after.currentNodeId);
});
