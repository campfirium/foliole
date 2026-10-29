import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { loadCompanionDailySession } from '../shared/platform/companion/runtime/companionDailyFlow';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';

import { useDailyFlowSurface } from './companionFlowDay.testSupport';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-26T08:00:00Z'));
  hydrateCurrentReviewSchedulerSettings({ newDayStartsAtHour: 4 });
  library = await createSearchLibrary(70, 32);
  library.database.prepare('UPDATE nodes SET created_at=?,updated_at=?').run('2026-10-26T00:00:00Z', '2026-10-26T00:00:00Z');
});
afterEach(async () => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); await library.close(); });

it('shows B and C with usable Read actions while the complete A learning transaction is blocked', async () => {
  const bodyQueries = vi.spyOn(library.readonlyQueries, 'query');
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const ui = renderHook(() => useDailyFlowSurface(initial));
  await waitFor(() => expect({ ready: ui.result.current.surface.flowReady, error: ui.result.current.surface.flowError }).toEqual({ ready: true, error: null }));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha'));
  const a = ui.result.current.surface.readableArticle!.nodeId;
  await waitFor(() => expect(bodyQueries.mock.calls.some(([sql, args]) =>
    sql.includes('SELECT article.*') && args?.[0] === '000001')).toBe(true));
  await getIosCompanionDatabaseOwner().readInteractiveSnapshot(async () => null);
  const foreground = vi.spyOn(getIosCompanionDatabaseOwner(), 'readInteractiveSnapshot')
    .mockRejectedValue(new Error('unexpected_click_time_read'));
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let entered = false;
  const executeSet = library.connection.executeSet;
  vi.spyOn(library.connection, 'executeSet').mockImplementation(async (...args) => {
    if (args[0].some(value => value.statement.includes('INSERT INTO node_reading')) && !entered) { entered = true; await blocked; }
    return executeSet(...args);
  });
  try {
    act(() => { void ui.result.current.surface.handleReadReviewTopic(); });
    await waitFor(() => expect(entered).toBe(true));
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).not.toBe(a));
    foreground.mockRestore();
    const b = ui.result.current.surface.readableArticle!.nodeId;
    expect(b).not.toBe(a);
    expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha');
    expect(ui.result.current.surface.isSubmittingReadingAction).toBe(false);
    await act(async () => { await ui.result.current.surface.handleReadReviewTopic(); });
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).not.toBe(b));
    const c = ui.result.current.surface.readableArticle!.nodeId;
    expect(c).not.toBe(a);
    expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha');
    expect(ui.result.current.surface.isSubmittingReadingAction).toBe(false);
    expect(library.database.prepare('SELECT count(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 0 });
    release();
    await waitFor(() => expect({ operations: library.database.prepare('SELECT count(*) AS n FROM daily_flow_operations').get(), error: ui.result.current.surface.readingError, flowError: ui.result.current.surface.flowError }).toEqual({ operations: { n: 2 }, error: null, flowError: null }));
    await act(async () => { await getIosCompanionDatabaseOwner().read(async () => null); });
    expect(ui.result.current.surface.readableArticle?.nodeId).toBe(c);
    expect((await loadCompanionDailySession())?.currentNodeId).toBe(c);
    expect(library.database.prepare('SELECT node_id,repetition_count FROM node_reading ORDER BY last_handled_at,node_id').all())
      .toEqual([a,b].sort().map(node_id => ({ node_id, repetition_count: 1 })));
    const history = library.database.prepare("SELECT value FROM companion_meta WHERE key LIKE 'flow_history:%'").pluck().get() as string;
    expect(JSON.parse(history).undoStack.map((entry: { nodeId: string }) => entry.nodeId)).toEqual([a,b]);
  } finally { release(); }
});

it('joins an unfinished successor preparation on Read instead of cancelling and selecting it again', async () => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const owner = getIosCompanionDatabaseOwner();
  const read = owner.readInteractiveSnapshot.bind(owner);
  let entered = false;
  let cancelled = false;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(owner, 'readInteractiveSnapshot').mockImplementation((task, signal) => read(db => task({ ...db,
    async query(sql, params) {
      if (sql.includes('order_key > ?') && !entered) {
        entered = true;
        signal?.addEventListener('abort', () => { cancelled = true; release(); }, { once: true });
        await waiting;
      }
      return db.query(sql, params);
    }
  }), signal));
  const ui = renderHook(() => useDailyFlowSurface(initial));
  try {
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toBeTruthy());
    await waitFor(() => expect(entered).toBe(true));
    const a = ui.result.current.surface.readableArticle!.nodeId;
    let action!: Promise<void>;
    act(() => { action = ui.result.current.surface.handleReadReviewTopic(); });
    const { getCompanionReadIntents } = await import('../shared/platform/companion/runtime/companionReadIntents');
    const engine = await getCompanionReadIntents();
    await waitFor(async () => expect(await engine.journal.rows(false)).toHaveLength(1));
    expect(cancelled).toBe(false);
    await act(async () => { release(); await action; await engine.drain(); });
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).not.toBe(a));
    expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha');
    expect(ui.result.current.surface.readingError).toBeNull();
    expect(library.database.prepare('SELECT count FROM topic_daily_counts').get()).toEqual({ count: 1 });
  } finally { release(); }
});
