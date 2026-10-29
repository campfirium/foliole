import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { registerCompanionWorkspaceRefresh } from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import * as display from '../shared/platform/companion/runtime/companionDailyFlowDisplay';
import { loadCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
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
  vi.setSystemTime(new Date('2026-10-26T08:00:00.000Z'));
  hydrateCurrentReviewSchedulerSettings({ newDayStartsAtHour: 4 });
  library = await createSearchLibrary(2, 32);
  library.database.prepare('UPDATE nodes SET created_at = ?, updated_at = ?').run('2026-10-26T00:00:00.000Z', '2026-10-26T00:00:00.000Z');
});
afterEach(async () => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); await library.close(); });

it.each([false, true].flatMap(pendingRefresh => (['soon', 'read', 'later', 'dismiss', 1, 2, 3, 4] as const).map(action => ({ action, pendingRefresh }))))(
  'rebuilds before the first $action once (pending refresh=$pendingRefresh)', async ({ action, pendingRefresh }) => {
    if (typeof action === 'number') {
      const records = await Promise.all(['000000', '000001'].map(id => toWorkspaceNativeNodeVersion({
        id, title: id, content: 'prefix alpha question', reveal: 'Answer', kind: 'item', parentNodeId: null,
        anchorLink: null, isTitleManual: true, hideTitleHeading: false, reading: null, review: null,
        createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T08:00:00.000Z'
      }, 'remote', `base-${id}`)));
      await getIosCompanionDatabaseOwner().runWriter(db => applySyncNodesWithDbPort(db, records, { enqueueSearchInvalidations: false }));
    }
    const initial = (await refreshCompanionWorkspaceAfterMutation())!;
    const ui = renderHook(() => useDailyFlowSurface(initial));
    await waitFor(() => expect(ui.result.current.surface.flowReady).toBe(true));
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha'));
    await getIosCompanionDatabaseOwner().runWriter(async () => null);
    await act(async () => { await ui.result.current.workspace.refreshAfterMutation(); });
    const target = ui.result.current.surface.readableArticle!.nodeId;
    if (pendingRefresh) registerCompanionWorkspaceRefresh({ kind: 'nodes', nodeIds: [], openStateNodeIds: [target] });
    if (typeof action === 'number') act(() => ui.result.current.surface.handleRevealAnswer());
    const before = library.database.prepare('SELECT day_key FROM daily_flow_state').get();
    vi.setSystemTime(new Date('2026-10-27T08:00:00.000Z'));
    await act(async () => {
      const surface = ui.result.current.surface;
      if (typeof action === 'number') await surface.handleGradeReview(action);
      else if (action === 'soon') await surface.handleSoonReviewTopic();
      else if (action === 'read') await surface.handleReadReviewTopic();
      else if (action === 'later') await surface.handlePostponeReviewTopic();
      else await surface.handleDismissReviewTopic();
    });
    expect(ui.result.current.surface.readingError).toBeNull();
    expect(ui.result.current.surface.reviewError).toBeNull();
    expect(library.database.prepare('SELECT day_key FROM daily_flow_state').get()).not.toEqual(before);
    expect(library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 1 });
    expect((await loadCompanionFlowHistory(ui.result.current.surface.flowHistoryKey)).undoStack).toHaveLength(1);
    if (typeof action === 'number') {
      expect(library.database.prepare('SELECT COUNT(*) AS n FROM review_log WHERE node_id=?').get(target)).toEqual({ n: 1 });
      expect(ui.result.current.snapshot.nodesById[target]!.review?.reps).toBe(1);
    } else if (action !== 'soon') expect(library.database.prepare('SELECT * FROM node_reading WHERE node_id=?').get(target)).toBeTruthy();
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).not.toBe(target));
    expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha');
    ui.unmount();
  });

async function openSurface() {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const ui = renderHook(({ onlyReview }) => useDailyFlowSurface(initial, onlyReview),
    { initialProps: { onlyReview: false } });
  await waitFor(() => expect(ui.result.current.surface.flowReady).toBe(true));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha'));
  await act(async () => { await ui.result.current.workspace.refreshAfterMutation(); });
  await getIosCompanionDatabaseOwner().runWriter(async () => null);
  return ui;
}

it('keeps yesterday’s later target out of today’s fresh current and cancels its old click', async () => {
  const ui = await openSurface();
  const first = ui.result.current.surface.readableArticle!.nodeId;
  await act(() => ui.result.current.surface.handleSoonReviewTopic());
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).not.toBe(first));
  vi.setSystemTime(new Date('2026-10-27T08:00:00.000Z'));
  await act(() => ui.result.current.surface.handleReadReviewTopic());
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).toBe(first));
  expect(library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 0 });
  expect(library.database.prepare('SELECT COUNT(*) AS n FROM node_reading').get()).toEqual({ n: 0 });
  expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha');
});

it.each(['leave', 'library', 'mode'] as const)('cancels the old click when %s changes during generation', async change => {
  const ui = await openSurface();
  vi.setSystemTime(new Date('2026-10-27T08:00:00.000Z'));
  const original = display.openCompanionDailyFlowForDisplay;
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const opened = new Promise<void>(resolve => { entered = resolve; });
  vi.spyOn(display, 'openCompanionDailyFlowForDisplay').mockImplementationOnce(async args => {
    const result = await original(args);
    entered();
    await held;
    return result;
  });
  let action!: Promise<void>;
  act(() => { action = ui.result.current.surface.handleReadReviewTopic(); });
  await opened;
  if (change === 'leave') act(() => ui.result.current.surface.handleTabAction('recent'));
  else if (change === 'library') act(() => invalidateCompanionReadingScope());
  else ui.rerender({ onlyReview: true });
  await act(async () => { release(); await action; });
  expect(library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 0 });
  expect(library.database.prepare('SELECT COUNT(*) AS n FROM node_reading').get()).toEqual({ n: 0 });
  if (change === 'leave') {
    expect(ui.result.current.surface.activeAction).toBe('recent');
    act(() => ui.result.current.surface.handleTabAction('review'));
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha'));
  } else if (change === 'mode') {
    await waitFor(() => expect(ui.result.current.surface.flowReady).toBe(true));
    expect(ui.result.current.surface.reviewSession.currentCard).toBeNull();
  } else {
    expect(ui.result.current.surface.flowReady).toBe(false);
    await act(async () => { await ui.result.current.workspace.refreshAfterMutation(); });
    await waitFor(() => expect(ui.result.current.surface.flowReady).toBe(true));
  }
});
