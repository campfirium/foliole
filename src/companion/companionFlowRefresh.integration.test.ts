// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { restoreFlowHistorySession } from '../../lib/core/flow/flowHistorySession';
import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { commitCompanionFlowHistory, loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createStartedReviewSession } from '../store/workspaceReviewReading';

import { createCompanionFlowHistoryEntry } from './companionFlowHistoryEntry';
import { persistFlowMutation } from './companionFlowMutation';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const now = '2026-10-26T00:00:00.000Z';
const key = 'flow_history:bounded-refresh';
beforeEach(async () => {
  library = await createSearchLibrary(256, 32);
  library.database.prepare('UPDATE nodes SET created_at = ?, updated_at = ?').run(now, now);
});
afterEach(async () => { vi.restoreAllMocks(); await library.close(); });

function observeSnapshotRows() {
  let count = 0;
  const owner = getIosCompanionDatabaseOwner();
  const original = owner.readSnapshot.bind(owner);
  const observe = (db: DbPort): DbPort => ({ ...db,
    query: async <R extends DbRow>(sql: string, params?: DbParams) => {
      const rows = await db.query<R>(sql, params);
      count += rows.length;
      return rows;
    }, transaction: task => db.transaction(tx => task(observe(tx))) });
  vi.spyOn(owner, 'readSnapshot').mockImplementation(<T>(task: (db: DbPort) => Promise<T>, signal?: AbortSignal) =>
    original(db => task(observe(db)), signal));
  return () => count;
}

function historyContext() {
  return { key, mode: 'recommended' as const, session: createStartedReviewSession({
    currentNodeId: '000000', continueNodeId: null, queueNodeIds: ['000000', '000001'],
    sessionStartedAt: now, totalNodeCount: 256
  }) };
}

it('keeps consecutive Soon history durable without materializing unrelated nodes', async () => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const rows = observeSnapshotRows();
  for (const nodeId of ['000000', '000001']) {
    const history = historyContext();
    history.session.currentNodeId = nodeId;
    await commitCompanionFlowHistory({ key, mode: history.mode, entry: createCompanionFlowHistoryEntry({
      action: 'soon', nodeId, now, before: initial, after: initial, history
    }) });
    const refreshed = (await refreshCompanionWorkspaceAfterMutation())!;
    expect(refreshed.nodeOrder).toEqual(initial.nodeOrder);
    expect(refreshed.nodesById[nodeId]?.reading).toEqual(initial.nodesById[nodeId]?.reading);
  }
  expect((await loadCompanionFlowHistory(key)).undoStack).toHaveLength(2);
  expect(rows()).toBeLessThan(100);
});

it.each(['read', 'later', 'dismiss'] as const)('refreshes %s and its undo/redo without reading unrelated nodes', async action => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const history = historyContext();
  const rows = observeSnapshotRows();
  await persistFlowMutation({ action, nodeId: '000000', now, snapshot: initial, history });
  const saved = (await refreshCompanionWorkspaceAfterMutation())!;
  expect(saved.nodesById['000000']?.reading).not.toEqual(initial.nodesById['000000']?.reading);
  const entry = (await loadCompanionFlowHistory(key)).undoStack.at(-1)!;
  if (entry.type === 'nodes.change') throw new Error('Expected a reading history entry.');
  const restoredSession = await replayCompanionFlowHistory(key, 'undo', restoreFlowHistorySession(entry.afterContext.reviewSession, history.session));
  const undone = (await refreshCompanionWorkspaceAfterMutation())!;
  expect(undone.nodesById['000000']?.reading).toEqual(initial.nodesById['000000']?.reading);
  await replayCompanionFlowHistory(key, 'redo', restoredSession!);
  const redone = (await refreshCompanionWorkspaceAfterMutation())!;
  expect(redone.nodesById['000000']?.reading).toEqual(saved.nodesById['000000']?.reading);
  expect(redone.nodeOrder).toEqual(initial.nodeOrder);
  expect(rows()).toBeLessThan(100);
});
