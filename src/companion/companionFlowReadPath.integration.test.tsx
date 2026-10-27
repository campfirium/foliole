import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { loadCompanionDailySession, predictCompanionFlowDocument } from '../shared/platform/companion/runtime/companionDailyFlow';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';

import { useDailyFlowSurface } from './companionFlowDay.testSupport';
import { persistFlowMutation } from './companionFlowMutation';

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

it('prepares a daily Read without copying unrelated workspace nodes before its transaction', async () => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const { openCompanionDailyFlow } = await import('../shared/platform/companion/runtime/companionDailyFlow');
  const now = new Date().toISOString();
  const session = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
  let started = false;
  let enumerations = 0;
  const begin = library.connection.beginTransaction.bind(library.connection);
  vi.spyOn(library.connection, 'beginTransaction').mockImplementation(async () => { started = true; return begin(); });
  const nodesById = new Proxy(initial.nodesById, { ownKeys(nodes) {
    if (!started) enumerations += 1;
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
  const ui = renderHook(() => useDailyFlowSurface(initial));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha'));
  const before = ui.result.current.surface.readableArticle!.nodeId;
  const state = (await loadCompanionDailySession())!;
  const next = await predictCompanionFlowDocument({ token: state.daily!, currentNodeId: before,
    now: new Date().toISOString() }, new AbortController().signal);
  expect(next).toBeTruthy();
  await waitFor(() => expect(queries.mock.calls.some(([sql, args]) => sql.includes('SELECT article.*') && args?.[0] === next)).toBe(true));
  await getIosCompanionDatabaseOwner().read(async () => null);
  queries.mockClear();
  await act(async () => { await ui.result.current.surface.handleReadReviewTopic(); });
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).toBe(next));
  expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha');
  expect(ui.result.current.surface.isSubmittingReadingAction).toBe(false);
  expect(ui.result.current.snapshot.nodesById[before]?.reading?.repetitionCount).toBe(1);
  expect(queries.mock.calls.filter(([sql, args]) => sql.includes('SELECT article.*') && args?.[0] === next)).toHaveLength(0);
  expect(queries.mock.calls.filter(([sql]) => sql.includes('FROM node_sync_conflicts'))).toHaveLength(0);
  expect(library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 1 });
});
