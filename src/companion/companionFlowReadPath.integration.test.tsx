import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import * as dailyRuntime from '../shared/platform/companion/runtime/companionDailyFlow';
import { loadCompanionDailySession, predictCompanionFlowDocument } from '../shared/platform/companion/runtime/companionDailyFlow';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { saveCompanionSyncNodeViewState } from '../shared/platform/companionSyncStateWriters';

import { persistFlowMutation } from './companionFlowMutation';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { createFloatingBar, createWorkspaceSync } from './useCompanionArticleSurfaceTestSupport';
import { useCompanionReadableArticleLoader } from './useCompanionReadableArticleLoader';
import { useCompanionWorkspaceState } from './useCompanionWorkspaceState';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-26T08:00:00.000Z'));
  hydrateCurrentReviewSchedulerSettings({ newDayStartsAtHour: 4 });
  library = await createSearchLibrary(256, 32);
  library.database.prepare('UPDATE nodes SET created_at = ?, updated_at = ?')
    .run('2026-10-26T00:00:00.000Z', '2026-10-26T00:00:00.000Z');
});
afterEach(async () => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); await library.close(); });

function useNativeSurface(initial: WorkspaceSnapshot) {
  const [state, setState] = useCompanionWorkspaceState(createWorkspaceSync(initial).state);
  const [readableArticle, publish] = useState<CompanionReadableArticle | null>(null);
  const snapshot = state.workspace_snapshot!;
  const loader = useCompanionReadableArticleLoader(snapshot, publish);
  const actions = createWorkspaceSnapshotActions({ state, setState, setError: () => {},
    setSyncConflictCount: () => {}, setSyncProgress: () => {}, setStatus: () => {} });
  const workspace = { ...createWorkspaceSync(snapshot), state, readableArticle,
    refreshAfterMutation: vi.fn(actions.refreshAfterMutation), openReadableArticle: loader.openReadableArticle };
  return { surface: useCompanionArticleSurface(workspace, createFloatingBar()), snapshot, workspace };
}

it('keeps the reading session untouched when only its scroll position changes', async () => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const ui = renderHook(() => useNativeSurface(initial));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha'));
  await getIosCompanionDatabaseOwner().read(async () => null);
  const before = ui.result.current.surface.readableArticle!.nodeId;
  const queries = vi.spyOn(library.connection, 'query');
  await act(async () => {
    await saveCompanionSyncNodeViewState({ nodeId: before, scrollTop: 340 });
    await ui.result.current.workspace.refreshAfterMutation();
  });
  await getIosCompanionDatabaseOwner().read(async () => null);
  expect(ui.result.current.snapshot.persistedNodeViewById?.[before]?.scrollTop).toBe(340);
  expect(ui.result.current.surface.readableArticle?.nodeId).toBe(before);
  expect(queries.mock.calls.filter(([sql]) => sql.includes('FROM daily_flow_state') ||
    sql.includes('FROM daily_flow_sync_facts'))).toEqual([]);
  expect(library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 0 });
});

it.each(['read', 'grade'] as const)('commits %s once when incoming content changes the cycle before its display receipt arrives', async action => {
  if (action === 'grade') library.database.exec("UPDATE nodes SET kind='item', reveal='Answer' WHERE id='000000'");
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const ui = renderHook(() => useNativeSurface(initial));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha'));
  const before = ui.result.current.surface.readableArticle!.nodeId;
  const { toWorkspaceNativeNodeVersion } = await import('../../lib/core/database/workspaceNodeSyncVersion');
  const { applyCompanionLocalNodeVersions } = await import('../shared/platform/companionSyncObjects');
  const { registerCompanionWorkspaceRefresh } = await import('../shared/platform/companion/companionWorkspaceSnapshotStore');
  const incoming = { ...initial.nodesById[before]!, id: 'incoming-topic', title: 'Incoming topic',
    content: 'Incoming complete body', reading: null };
  await applyCompanionLocalNodeVersions([await toWorkspaceNativeNodeVersion(incoming, 'remote')]);
  registerCompanionWorkspaceRefresh({ kind: 'full' });
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let received = false;
  const open = dailyRuntime.openCompanionDailyFlow;
  vi.spyOn(dailyRuntime, 'openCompanionDailyFlow').mockImplementationOnce(async args => {
    const result = await open(args);
    received = true;
    await waiting;
    return result;
  });
  try {
    await act(async () => { await ui.result.current.workspace.refreshAfterMutation(); });
    await waitFor(() => expect(received).toBe(true));
    await act(async () => {
      if (action === 'grade') ui.result.current.surface.handleRevealAnswer();
    });
    await act(async () => {
      const mutation = action === 'grade' ? ui.result.current.surface.handleGradeReview(3)
        : ui.result.current.surface.handleReadReviewTopic();
      await new Promise(resolve => setTimeout(resolve, 50));
      release();
      await mutation;
    });
    expect(ui.result.current.surface.reviewError).toBeNull();
    expect(ui.result.current.surface.readingError).toBeNull();
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).not.toBe(before));
    expect(ui.result.current.surface.readingError).toBeNull();
    expect(ui.result.current.surface.readableArticle?.content).toBeTruthy();
    if (action === 'grade') expect(library.database.prepare('SELECT reps FROM node_review WHERE node_id=?').get(before))
      .toEqual({ reps: 1 });
    else expect(library.database.prepare('SELECT repetition_count FROM node_reading WHERE node_id=?').get(before))
      .toEqual({ repetition_count: 1 });
    expect((await loadCompanionDailySession())?.currentNodeId).toBe(ui.result.current.surface.readableArticle?.nodeId);
  } finally { release(); }
});

it('commits a daily Read without materializing an unused whole-workspace projection', async () => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const { openCompanionDailyFlow } = await import('../shared/platform/companion/runtime/companionDailyFlow');
  const now = new Date().toISOString();
  const session = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
  let enumerations = 0;
  const nodesById = new Proxy(initial.nodesById, { ownKeys(nodes) {
    enumerations += 1;
    return Reflect.ownKeys(nodes);
  } });
  const result = await persistFlowMutation({ action: 'read', nodeId: session.currentNodeId!, now,
    snapshot: { ...initial, nodesById }, history: { key: 'flow_history:read-path', mode: 'recommended', session } });
  expect(enumerations).toBe(0);
  expect(result.session?.currentNodeId).not.toBe(session.currentNodeId);
  expect(result.snapshot.nodesById[session.currentNodeId!]?.reading?.repetitionCount).toBe(1);
  expect(result.snapshot.nodesById['000255']).toEqual(initial.nodesById['000255']);
});

it('uses the daily successor and its prepared body through automatic Read display', async () => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const queries = vi.spyOn(library.connection, 'query');
  const bodyQueries = vi.spyOn(library.readonlyQueries, 'query');
  const ui = renderHook(() => useNativeSurface(initial));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha'));
  const before = ui.result.current.surface.readableArticle!.nodeId;
  const state = (await loadCompanionDailySession())!;
  const next = await predictCompanionFlowDocument({ token: state.daily!, currentNodeId: before,
    now: new Date().toISOString() }, new AbortController().signal);
  expect(next).toBeTruthy();
  await waitFor(() => expect(bodyQueries.mock.calls.some(([sql, args]) => sql.includes('SELECT article.*') && args?.[0] === next)).toBe(true));
  await getIosCompanionDatabaseOwner().readInteractiveSnapshot(async () => null);
  queries.mockClear();
  bodyQueries.mockClear();
  // A prepared Read must still navigate when all fresh foreground reads are unavailable.
  // The writer uses its real connection and remains fully enabled.
  const foreground = vi.spyOn(getIosCompanionDatabaseOwner(), 'readInteractiveSnapshot')
    .mockRejectedValue(new Error('unexpected_click_time_read'));
  let learningVisits = 0;
  const unrelated = initial.nodesById['000255']!;
  const reading = unrelated.reading;
  Object.defineProperty(unrelated, 'reading', { configurable: true, enumerable: true,
    get() { learningVisits += 1; return reading; } });
  act(() => { void ui.result.current.surface.handleReadReviewTopic(); });
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).toBe(next));
  await getIosCompanionDatabaseOwner().read(async () => null);
  foreground.mockRestore();
  expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha');
  expect(ui.result.current.surface.isSubmittingReadingAction).toBe(false);
  expect(ui.result.current.snapshot.nodesById[before]?.reading?.repetitionCount).toBe(1);
  expect(bodyQueries.mock.calls.filter(([sql, args]) => sql.includes('SELECT article.*') && args?.[0] === next)).toHaveLength(0);
  expect(queries.mock.calls.filter(([sql]) => sql.includes('FROM node_sync_conflicts'))).toHaveLength(0);
  expect(queries.mock.calls.filter(([sql]) => sql.includes('INTO workspace_meta') && sql.includes('active_node_id'))).toHaveLength(0);
  expect(learningVisits).toBe(0);
  expect(library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 1 });
});
