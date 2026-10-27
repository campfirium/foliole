import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { loadCompanionDailySession, predictCompanionFlowDocument } from '../shared/platform/companion/runtime/companionDailyFlow';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

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
  return { surface: useCompanionArticleSurface(workspace, createFloatingBar()), snapshot };
}

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
  const ui = renderHook(() => useNativeSurface(initial));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha'));
  const before = ui.result.current.surface.readableArticle!.nodeId;
  const state = (await loadCompanionDailySession())!;
  const next = await predictCompanionFlowDocument({ token: state.daily!, currentNodeId: before,
    now: new Date().toISOString() }, new AbortController().signal);
  expect(next).toBeTruthy();
  await waitFor(() => expect(queries.mock.calls.some(([sql, args]) => sql.includes('SELECT article.*') && args?.[0] === next)).toBe(true));
  await getIosCompanionDatabaseOwner().read(async () => null);
  queries.mockClear();
  let learningVisits = 0;
  const unrelated = initial.nodesById['000255']!;
  const reading = unrelated.reading;
  Object.defineProperty(unrelated, 'reading', { configurable: true, enumerable: true,
    get() { learningVisits += 1; return reading; } });
  act(() => { void ui.result.current.surface.handleReadReviewTopic(); });
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).toBe(next));
  await getIosCompanionDatabaseOwner().read(async () => null);
  expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha');
  expect(ui.result.current.surface.isSubmittingReadingAction).toBe(false);
  expect(ui.result.current.snapshot.nodesById[before]?.reading?.repetitionCount).toBe(1);
  expect(queries.mock.calls.filter(([sql, args]) => sql.includes('SELECT article.*') && args?.[0] === next)).toHaveLength(0);
  expect(queries.mock.calls.filter(([sql]) => sql.includes('FROM node_sync_conflicts'))).toHaveLength(0);
  expect(queries.mock.calls.filter(([sql]) => sql.includes('INTO workspace_meta') && sql.includes('active_node_id'))).toHaveLength(0);
  expect(learningVisits).toBe(0);
  expect(library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 1 });
});
