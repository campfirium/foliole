import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { registerCompanionSyncAppliedRefresh } from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { loadCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { resolveCompanionRecentArticles } from '../shared/platform/companionBrowseLists';
import * as queuePlanner from '../store/reviewQueuePlanner';

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
  library = await createSearchLibrary(4, 32);
});
afterEach(async () => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); await library.close(); });

async function seedItems() {
  const records = await Promise.all(['000000', '000001'].map(id => toWorkspaceNativeNodeVersion({
    id, title: id, content: 'prefix alpha question', reveal: 'Answer', kind: 'item', parentNodeId: null,
    anchorLink: null, isTitleManual: true, hideTitleHeading: false, reading: null, review: null,
    createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T08:00:00.000Z'
  }, 'remote', `base-${id}`)));
  await getIosCompanionDatabaseOwner().runWriter(db => applySyncNodesWithDbPort(db, records, { enqueueSearchInvalidations: false }));
}

it.each(['soon', 'later', 'read', 'dismiss', 1, 2, 3, 4] as const)(
  'completes %s without sorting hidden Browse and opens the latest actual list', async action => {
    if (typeof action === 'number') await seedItems();
    library.database.prepare('UPDATE nodes SET created_at = ?, updated_at = ?').run('2026-10-26T00:00:00.000Z', '2026-10-26T00:00:00.000Z');
    const initial = (await refreshCompanionWorkspaceAfterMutation())!;
    const ui = renderHook(() => useDailyFlowSurface(initial));
    await waitFor(() => expect(ui.result.current.surface.flowReady).toBe(true));
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha'));
    await act(async () => { await ui.result.current.workspace.refreshAfterMutation(); });
    const target = ui.result.current.surface.readableArticle!.nodeId;
    if (typeof action === 'number') act(() => ui.result.current.surface.handleRevealAnswer());
    const compare = vi.spyOn(String.prototype, 'localeCompare');
    const plan = vi.spyOn(queuePlanner, 'buildReviewQueuePlan');
    await act(async () => {
      const surface = ui.result.current.surface;
      if (typeof action === 'number') await surface.handleGradeReview(action);
      else if (action === 'soon') await surface.handleSoonReviewTopic();
      else if (action === 'later') await surface.handlePostponeReviewTopic();
      else if (action === 'read') await surface.handleReadReviewTopic();
      else await surface.handleDismissReviewTopic();
    });
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).not.toBe(target));
    expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha');
    expect(ui.result.current.surface.isSubmittingReadingAction).toBe(false);
    expect(ui.result.current.surface.readingError).toBeNull();
    expect(ui.result.current.surface.reviewError).toBeNull();
    // Numeric title comparisons identify the observed whole-list work, not learning timestamp comparisons.
    expect(compare.mock.calls.filter(call => call[2]?.numeric)).toHaveLength(0);
    compare.mockRestore();
    expect(plan).not.toHaveBeenCalled();
    plan.mockRestore();
    expect(library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations').get()).toEqual({ n: 1 });
    const history = await loadCompanionFlowHistory(ui.result.current.surface.flowHistoryKey);
    expect(history.undoStack).toHaveLength(1);
    const stored = library.database.prepare('SELECT session_json FROM daily_flow_state').pluck().get() as string;
    expect(JSON.parse(stored)).toMatchObject({ flowFormat: 'cycle-v1',
      currentNodeId: ui.result.current.surface.readableArticle!.nodeId });
    if (typeof action === 'number') {
      expect(library.database.prepare('SELECT grade FROM review_log WHERE node_id=?').get(target)).toEqual({ grade: action });
      expect(ui.result.current.snapshot.nodesById[target]!.review?.reps).toBe(1);
    } else {
      expect(library.database.prepare('SELECT COUNT(*) AS n FROM review_log').get()).toEqual({ n: 0 });
      const reading = ui.result.current.snapshot.nodesById[target]!.reading;
      if (action === 'soon') expect(reading).toEqual(initial.nodesById[target]!.reading);
      else expect(reading).toMatchObject({ state: action === 'dismiss' ? 'dismissed' : 'active',
        ...(action === 'dismiss' ? {} : { repetitionCount: 1 }) });
    }
    act(() => ui.result.current.surface.handleTabAction('recent'));
    expect(ui.result.current.surface.recentArticles).toEqual(resolveCompanionRecentArticles(ui.result.current.snapshot));
    expect(ui.result.current.surface.recentArticles.length).toBeGreaterThan(0);
  });

it('returns from Flow to current remote membership, titles, previews and sort order', async () => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const ui = renderHook(() => useDailyFlowSurface(initial));
  await waitFor(() => expect(ui.result.current.surface.flowReady).toBe(true));
  act(() => ui.result.current.surface.handleTabAction('recent'));
  expect(ui.result.current.surface.recentArticles.map(node => node.nodeId)).toContain('000003');
  act(() => ui.result.current.surface.handleTabAction('review'));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha'));
  const compare = vi.spyOn(String.prototype, 'localeCompare');
  const updatedAt = '2026-10-26T09:00:00.000Z';
  const records = await Promise.all([
    toWorkspaceNativeNodeVersion({ ...initial.nodesById['000002']!, content: 'Updated remote body', openingText: 'Updated remote body',
      title: 'Updated remote title', isTitleManual: true, updatedAt }, 'remote', 'changed'),
    toWorkspaceNativeNodeVersion({ ...initial.nodesById['000003']!, deletedAt: updatedAt, updatedAt }, 'remote', 'deleted')
  ]);
  await act(async () => {
    await getIosCompanionDatabaseOwner().runWriter(db => applySyncNodesWithDbPort(db, records, { enqueueSearchInvalidations: false }));
    registerCompanionSyncAppliedRefresh({ kind: 'nodes', nodeIds: ['000002', '000003'] });
    await ui.result.current.workspace.refreshAfterMutation();
  });
  expect(compare.mock.calls.filter(call => call[2]?.numeric)).toHaveLength(0);
  compare.mockRestore();
  act(() => ui.result.current.surface.handleTabAction('recent'));
  const articles = ui.result.current.surface.recentArticles;
  expect(articles.map(node => node.nodeId)).not.toContain('000003');
  expect(articles[0]).toMatchObject({ nodeId: '000002', title: 'Updated remote title', preview: 'Updated remote body' });
  expect(articles).toEqual(resolveCompanionRecentArticles(ui.result.current.snapshot));
});
