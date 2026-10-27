// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { restoreFlowHistorySession } from '../../lib/core/flow/flowHistorySession';
import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { commitCompanionFlowHistory, loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createStartedReviewSession } from '../store/workspaceReviewReading';

import { createCompanionFlowHistoryEntry } from './companionFlowHistoryEntry';
import { persistFlowMutation } from './companionFlowMutation';
import { CompanionReadingActivity } from './companionReadingActivity';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import { createFloatingBar, createWorkspaceSync } from './useCompanionArticleSurfaceTestSupport';
import { useCompanionFlowSession } from './useCompanionFlowSession';
import { useCompanionReadableArticleLoader } from './useCompanionReadableArticleLoader';
import { useCompanionSurfaceActions } from './useCompanionSurfaceActions';

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
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await library.close(); });

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

function useReadingSurface(initial: WorkspaceSnapshot, publish: ReturnType<typeof vi.fn>) {
  const [state, setState] = useState(createWorkspaceSync(initial).state);
  const snapshot = state.workspace_snapshot!;
  const flow = useCompanionFlowSession({ snapshot, ready: true, active: true, onlyReview: false,
    libraryScope: initial.libraryScope ?? 'surface-refresh' });
  const nodeId = flow.view.currentCard?.nodeId ?? null;
  const activity = useMemo(() => new CompanionReadingActivity(nodeId, () => {}), [nodeId]);
  const workspace = createWorkspaceSync(snapshot);
  const snapshotActions = createWorkspaceSnapshotActions({ state, setState,
    setError: () => {}, setSyncConflictCount: () => {}, setSyncProgress: () => {}, setStatus: () => {} });
  workspace.refreshAfterMutation.mockImplementation(snapshotActions.refreshAfterMutation);
  const actions = useCompanionSurfaceActions({ flow, snapshot, activity, active: true,
    workspaceSync: workspace, floatingBar: createFloatingBar() });
  const article = useCompanionReadableArticleLoader(snapshot, publish);
  return { flow, actions, snapshot, article };
}

it.each(['read', 'later', 'dismiss'] as const)('advances the real %s surface with local facts and the prepared next body', async action => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const publish = vi.fn();
  const queries = vi.spyOn(library.connection, 'query');
  const ui = renderHook(() => useReadingSurface(initial, publish));
  await waitFor(() => expect(ui.result.current.flow.ready).toBe(true));
  const source = ui.result.current.flow.view.currentCard!.nodeId;
  const next = ui.result.current.flow.view.queueNodeIds[1]!;
  const body = library.database.prepare('SELECT content FROM nodes WHERE id = ?').get(next) as { content: string };
  await waitFor(() => expect(queries.mock.calls.some(([sql, params]) =>
    sql.includes('SELECT article.*') && params?.[0] === next)).toBe(true));
  await getIosCompanionDatabaseOwner().read(async () => null);
  queries.mockClear();
  const rows = observeSnapshotRows();
  const submit = action === 'read' ? 'handleReadReviewTopic'
    : action === 'later' ? 'handlePostponeReviewTopic' : 'handleDismissReviewTopic';
  await act(async () => { await ui.result.current.actions[submit](); });
  expect(ui.result.current.actions.readingError).toBeNull();
  expect(ui.result.current.flow.view.currentCard?.nodeId).toBe(next);
  expect(ui.result.current.snapshot.nodesById[source]?.reading).not.toEqual(initial.nodesById[source]?.reading);
  expect(ui.result.current.snapshot.nodesById['000255']).toEqual(initial.nodesById['000255']);
  expect((await loadCompanionFlowHistory(ui.result.current.flow.historyKey)).undoStack).toHaveLength(1);
  await act(async () => { await ui.result.current.article.openReadableArticle(next); });
  expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ nodeId: next, content: body.content }));
  expect(queries.mock.calls.filter(([sql, params]) => sql.includes('SELECT article.*') && params?.[0] === next)).toHaveLength(0);
  expect(rows()).toBeLessThan(100);
  await act(async () => { await ui.result.current.actions.handleFlowHistory('undo'); });
  expect(ui.result.current.flow.view.currentCard?.nodeId).toBe(source);
  expect(ui.result.current.snapshot.nodesById[source]?.reading).toEqual(initial.nodesById[source]?.reading);
  await act(async () => { await ui.result.current.actions.handleFlowHistory('redo'); });
  expect(ui.result.current.flow.view.currentCard?.nodeId).toBe(next);
  ui.unmount();
});

it.each(['read', 'later', 'dismiss'] as const)('retries only the saved %s surface result after a local refresh failure', async action => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const ui = renderHook(() => useReadingSurface(initial, vi.fn()));
  await waitFor(() => expect(ui.result.current.flow.ready).toBe(true));
  const source = ui.result.current.flow.view.currentCard!.nodeId;
  const next = ui.result.current.flow.view.queueNodeIds[1]!;
  const owner = getIosCompanionDatabaseOwner();
  vi.spyOn(owner, 'readSnapshot').mockRejectedValueOnce(new Error('local refresh failed'));
  const submit = action === 'read' ? 'handleReadReviewTopic'
    : action === 'later' ? 'handlePostponeReviewTopic' : 'handleDismissReviewTopic';
  await act(async () => { await ui.result.current.actions[submit](); });
  expect(ui.result.current.actions.readingError).toBe('local refresh failed');
  expect(ui.result.current.flow.view.currentCard?.nodeId).toBe(source);
  const historyKey = ui.result.current.flow.historyKey;
  expect((await loadCompanionFlowHistory(historyKey)).undoStack).toHaveLength(1);
  const facts = library.database.prepare('SELECT * FROM node_reading WHERE node_id = ?').get(source);
  await act(async () => { await ui.result.current.actions[submit](); });
  expect(ui.result.current.actions.readingError).toBeNull();
  expect(ui.result.current.flow.view.currentCard?.nodeId).toBe(next);
  expect((await loadCompanionFlowHistory(historyKey)).undoStack).toHaveLength(1);
  expect(library.database.prepare('SELECT * FROM node_reading WHERE node_id = ?').get(source)).toEqual(facts);
  ui.unmount();
});
