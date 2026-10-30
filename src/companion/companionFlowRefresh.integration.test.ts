// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver';
import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { openCompanionDailyFlow, predictCompanionFlowDocument } from '../shared/platform/companion/runtime/companionDailyFlow';
import { commitCompanionFlowHistory, loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { getCompanionReadIntents } from '../shared/platform/companion/runtime/companionReadIntents';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { currentCompanionRequestSyncDatabaseHost } from '../shared/platform/companion/sync/framed/companionRequestSyncDatabaseHost';
import { exchangeBodySyncOverHttp } from '../test/bodySyncHttp.testSupport';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';
import { act as peerAction, node, open } from '../test/dailyFlowExceptions.testSupport';

import { createCompanionFlowHistoryEntry } from './companionFlowHistoryEntry';
import { persistFlowMutation } from './companionFlowMutation';
import { CompanionReadingActivity } from './companionReadingActivity';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import { createFloatingBar, createWorkspaceSync } from './useCompanionArticleSurfaceTestSupport';
import { useCompanionFlowSession } from './useCompanionFlowSession';
import { useCompanionReadableArticleLoader } from './useCompanionReadableArticleLoader';
import { useCompanionSurfaceActions } from './useCompanionSurfaceActions';
import { useCompanionWorkspaceState } from './useCompanionWorkspaceState';

vi.hoisted(() => { vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor); });

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

async function historyContext(preferredNodeId = '000000') {
  return { key, mode: 'recommended' as const, session:
    (await openCompanionDailyFlow({ now, mode: 'recommended', preferredNodeId })).session };
}

it('keeps consecutive Soon history durable without materializing unrelated nodes', async () => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  await historyContext();
  const rows = observeSnapshotRows();
  for (const nodeId of ['000000', '000001']) {
    const history = await historyContext(nodeId);
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
  const history = await historyContext();
  const rows = observeSnapshotRows();
  const result = await persistFlowMutation({ action, nodeId: '000000', now, snapshot: initial, history });
  const saved = (await refreshCompanionWorkspaceAfterMutation())!;
  expect(saved.nodesById['000000']?.reading).not.toEqual(initial.nodesById['000000']?.reading);
  const restoredSession = await replayCompanionFlowHistory(key, 'undo', result.session!);
  const undone = (await refreshCompanionWorkspaceAfterMutation())!;
  expect(undone.nodesById['000000']?.reading).toEqual(initial.nodesById['000000']?.reading);
  await replayCompanionFlowHistory(key, 'redo', restoredSession!);
  const redone = (await refreshCompanionWorkspaceAfterMutation())!;
  expect(redone.nodesById['000000']?.reading).toEqual(saved.nodesById['000000']?.reading);
  expect(redone.nodeOrder).toEqual(initial.nodeOrder);
  expect(rows()).toBeLessThan(100);
});

function useReadingSurface(initial: WorkspaceSnapshot, publish: Parameters<typeof useCompanionReadableArticleLoader>[1]) {
  const [state, setState] = useCompanionWorkspaceState(createWorkspaceSync(initial).state);
  const snapshot = state.workspace_snapshot!;
  const flow = useCompanionFlowSession({ snapshot, ready: true, active: true,     libraryScope: initial.libraryScope ?? 'surface-refresh' });
  const nodeId = flow.view.currentCard?.nodeId ?? null;
  const activity = useMemo(() => new CompanionReadingActivity(nodeId, () => {}), [nodeId]);
  const workspace = createWorkspaceSync(snapshot);
  const snapshotActions = createWorkspaceSnapshotActions({ state, setState,
    setError: () => {}, setSyncConflictCount: () => {}, setSyncProgress: () => {}, setStatus: () => {} });
  workspace.refreshAfterMutation.mockImplementation(snapshotActions.refreshAfterMutation);
  const actions = useCompanionSurfaceActions({ flow, snapshot, activity, active: true,
    workspaceSync: workspace, floatingBar: createFloatingBar() });
  const article = useCompanionReadableArticleLoader(snapshot, publish);
  return { flow, actions, snapshot, article, refresh: snapshotActions.refreshAfterMutation };
}

it.each(['read', 'later', 'dismiss'] as const)('advances the real %s surface with local facts and the prepared next body', async action => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const publish = vi.fn();
  const queries = vi.spyOn(library.connection, 'query');
  const bodyQueries = vi.spyOn(library.readonlyQueries, 'query');
  const ui = renderHook(() => useReadingSurface(initial, publish));
  await waitFor(() => expect(ui.result.current.flow.ready).toBe(true));
  const source = ui.result.current.flow.view.currentCard!.nodeId;
  const session = ui.result.current.flow.capture().session;
  const next = (await predictCompanionFlowDocument({ token: session.daily!, currentNodeId: session.currentNodeId!,
    now: new Date().toISOString() }, new AbortController().signal))!;
  const body = library.database.prepare('SELECT content FROM nodes WHERE id = ?').get(next) as { content: string };
  await waitFor(() => expect(bodyQueries.mock.calls.some(([sql, params]) =>
    sql.includes('SELECT article.*') && params?.[0] === next)).toBe(true));
  await getIosCompanionDatabaseOwner().readInteractiveSnapshot(async () => null);
  queries.mockClear();
  bodyQueries.mockClear();
  const rows = observeSnapshotRows();
  const submit = action === 'read' ? 'handleReadReviewTopic'
    : action === 'later' ? 'handlePostponeReviewTopic' : 'handleDismissReviewTopic';
  await act(async () => { await ui.result.current.actions[submit](); });
  expect(ui.result.current.actions.readingError).toBeNull();
  expect(ui.result.current.flow.view.currentCard?.nodeId).toBe(next);
  await act(async () => { await (await getCompanionReadIntents()).drain(); });
  await waitFor(() => expect(ui.result.current.snapshot.nodesById[source]?.reading).not.toEqual(initial.nodesById[source]?.reading));
  expect(ui.result.current.snapshot.nodesById[source]?.reading).not.toEqual(initial.nodesById[source]?.reading);
  expect(ui.result.current.snapshot.nodesById['000255']).toEqual(initial.nodesById['000255']);
  expect((await loadCompanionFlowHistory(ui.result.current.flow.historyKey)).undoStack).toHaveLength(1);
  await act(async () => { await ui.result.current.article.openReadableArticle(next); });
  expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ nodeId: next, content: body.content }));
  expect(bodyQueries.mock.calls.filter(([sql, params]) => sql.includes('SELECT article.*') && params?.[0] === next)).toHaveLength(0);
  expect(rows()).toBeLessThan(100);
  await act(async () => { await ui.result.current.actions.handleFlowHistory('undo'); });
  expect(ui.result.current.flow.view.currentCard?.nodeId).toBe(source);
  expect(ui.result.current.snapshot.nodesById[source]?.reading).toEqual(initial.nodesById[source]?.reading);
  await act(async () => { await ui.result.current.actions.handleFlowHistory('redo'); });
  expect(ui.result.current.flow.view.currentCard?.nodeId).toBe(next);
  ui.unmount();
});

it.each(['later', 'dismiss'] as const)('retries only the saved %s surface result after a local refresh failure', async action => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const ui = renderHook(() => useReadingSurface(initial, vi.fn()));
  await waitFor(() => expect(ui.result.current.flow.ready).toBe(true));
  const source = ui.result.current.flow.view.currentCard!.nodeId;
  const session = ui.result.current.flow.capture().session;
  const next = (await predictCompanionFlowDocument({ token: session.daily!, currentNodeId: session.currentNodeId!,
    now: new Date().toISOString() }, new AbortController().signal))!;
  const owner = getIosCompanionDatabaseOwner();
  vi.spyOn(owner, 'readSnapshot').mockRejectedValueOnce(new Error('local refresh failed'));
  const submit = action === 'later' ? 'handlePostponeReviewTopic' : 'handleDismissReviewTopic';
  await act(async () => { await ui.result.current.actions[submit](); });
  await waitFor(() => expect(ui.result.current.actions.readingError).toBe('local refresh failed'));
  // The native store has already published the committed receipt before the refresh fails.
  expect(ui.result.current.flow.view.currentCard?.nodeId).toBe(next);
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


it('keeps the real mobile article after peer Read and validates before applying the next tap', async () => {
  await library.close();
  library = await createSearchLibrary(0);
  const peers = await connectCompanionPeer(library);
  try {
    node(peers.desktop, 'a', 'topic'); node(peers.desktop, 'b', 'topic');
    await peers.exchange();
    const initial = (await refreshCompanionWorkspaceAfterMutation())!;
    const ui = renderHook(() => useReadingSurface(initial, vi.fn()));
    await waitFor(() => expect(ui.result.current.flow.ready).toBe(true));
    const source = ui.result.current.flow.view.currentCard!.nodeId;
    const remote = await open(peers.desktop, new Date().toISOString());
    expect(remote.currentNodeId).toBe(source);
    await peerAction(peers.desktop, remote, 'read', new Date().toISOString());
    await act(async () => { await peers.exchange(); await ui.result.current.refresh(); });
    await waitFor(() => expect(ui.result.current.snapshot.nodesById[source]?.reading).not.toBeNull());
    expect(ui.result.current.flow.view.currentCard?.nodeId).toBe(source);
    const readings = library.database.prepare('SELECT * FROM node_reading ORDER BY node_id').all();
    await act(async () => { await ui.result.current.actions.handleReadReviewTopic(); });
    expect(ui.result.current.flow.view.currentCard?.nodeId).not.toBe(source);
    await act(async () => { await (await getCompanionReadIntents()).drain().catch(() => undefined); });
    expect(ui.result.current.actions.readingError).toBe('The clicked topic changed before it could be saved.');
    expect(library.database.prepare('SELECT * FROM node_reading ORDER BY node_id').all()).toEqual(readings);
    expect((await loadCompanionFlowHistory(ui.result.current.flow.historyKey)).undoStack).toHaveLength(0);
    ui.unmount();
  } finally { vi.unstubAllGlobals(); await closeLibraries(); }
});


it('keeps the real article and sequence after HTTP body sync without blocking Read on full preparation', async () => {
  vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
  await library.close(); library = await createSearchLibrary(0);
  const peers = await connectCompanionPeer(library);
  try {
    for (const id of ['a', 'b', 'c']) node(peers.desktop, id, 'topic');
    await peers.exchange();
    const initial = (await refreshCompanionWorkspaceAfterMutation())!;
    const publish = vi.fn();
    const ui = renderHook(() => useReadingSurface(initial, publish));
    await waitFor(() => expect(ui.result.current.flow.ready).toBe(true));
    const session = ui.result.current.flow.capture().session;
    const source = session.currentNodeId!;
    const before = library.database.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all();
    const queries = vi.spyOn(library.connection, 'query');
    upsertNodeSnapshot(peers.desktop.driver, { nodeId: source, kind: 'topic', title: source,
      content: 'Changed through real HTTP', parentNodeId: null, position: null,
      isTitleManual: true, anchorLink: null, reveal: null, createdAt: now, updatedAt: new Date().toISOString() });
    flushNodeSyncVersionWithDriver(peers.desktop.driver, source, peers.desktop.name, new Date().toISOString());
    const host = await currentCompanionRequestSyncDatabaseHost();
    await act(async () => { await exchangeBodySyncOverHttp(peers.desktop, peers.mobile, host); await ui.result.current.refresh(); });
    await waitFor(() => expect(ui.result.current.snapshot.nodesById[source]?.updatedAt).not.toBe(initial.nodesById[source]?.updatedAt));
    expect(ui.result.current.flow.view.currentCard?.nodeId).toBe(source);
    expect(library.database.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all()).toEqual(before);
    expect(library.database.prepare('SELECT content FROM nodes WHERE id=?').pluck().get(source)).toBe('Changed through real HTTP');
    await act(async () => { await ui.result.current.article.openReadableArticle(source); });
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ nodeId: source, content: 'Changed through real HTTP' }));
    await act(async () => { await ui.result.current.actions.handleReadReviewTopic(); });
    expect(ui.result.current.actions.readingError).toBeNull();
    expect(ui.result.current.flow.view.currentCard?.nodeId).not.toBe(source);
    expect(queries.mock.calls.filter(([sql]) => /SELECT \* FROM daily_flow_entries ORDER BY|SELECT .* FROM nodes n$|SELECT id, title, created_at AS createdAt FROM nodes/.test(sql))).toEqual([]);
    ui.unmount();
  } finally { vi.unstubAllGlobals(); await closeLibraries(); }
});
