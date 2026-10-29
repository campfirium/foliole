import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { loadCompanionDailySession } from '../shared/platform/companion/runtime/companionDailyFlow';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';

import { deferred } from './companionContentEditingTestSupport';
import { useDailyFlowSurface } from './companionFlowDay.testSupport';
import { useCompanionFlowSession } from './useCompanionFlowSession';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-28T08:00:00.000Z'));
  library = await createSearchLibrary(2, 32);
});
afterEach(async () => {
  cleanup();
  await runCompanionSyncWriterTask(async () => undefined);
  vi.useRealTimers();
  await library.close();
});
const operationCount = () => library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations').get();

async function setup() {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const ui = renderHook(() => useDailyFlowSurface(initial));
  await waitFor(() => expect(ui.result.current.surface.flowReady).toBe(true));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha'));
  return ui;
}

it('resumes the unfinished reading topic after restoring a cloze outside Flow', async () => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const ui = renderHook(({ active, value }) => useCompanionFlowSession({
    snapshot: value, active, ready: true, onlyReview: false, libraryScope: 'restore-flow'
  }), { initialProps: { active: true, value: initial } });
  await waitFor(() => expect(ui.result.current.ready).toBe(true));
  const current = ui.result.current.view.currentCard!.nodeId;
  ui.rerender({ active: false, value: initial });
  const record = await toWorkspaceNativeNodeVersion({ id: 'restored-cloze', kind: 'item', parentNodeId: current,
    title: 'Restored cloze', content: 'Question', reveal: 'Answer', anchorLink: null,
    isTitleManual: true, hideTitleHeading: false, reading: null, review: null,
    createdAt: '2026-10-28T07:00:00.000Z', updatedAt: '2026-10-28T08:00:00.000Z'
  }, 'remote', 'restore-cloze');
  await getIosCompanionDatabaseOwner().runWriter(db => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }));
  const restored = (await refreshCompanionWorkspaceAfterMutation())!;
  ui.rerender({ active: false, value: restored });
  ui.rerender({ active: true, value: restored });
  await waitFor(() => expect(ui.result.current.view.currentCard?.nodeId).toBe(current));
});

it.each(['leave', 'library'] as const)('cancels a reading action waiting for content when its %s context changes', async change => {
  const ui = await setup();
  const save = deferred<void>();
  ui.result.current.surface.readingActivity.flushDraft = () => save.promise;
  let action!: Promise<void>;
  act(() => { action = ui.result.current.surface.handleReadReviewTopic(); });
  if (change === 'leave') act(() => ui.result.current.surface.handleTabAction('recent'));
  else act(() => invalidateCompanionReadingScope());
  await act(async () => { save.resolve(); await action; });
  expect(operationCount()).toEqual({ n: 0 });
  expect(library.database.prepare('SELECT * FROM node_reading').all()).toEqual([]);
});

it('submits Read without requesting a pending position flush', async () => {
  const ui = await setup();
  const position = deferred<void>();
  let requested = false;
  ui.result.current.surface.readingActivity.flushPosition = () => {
    requested = true;
    return position.promise;
  };
  let action!: Promise<void>;
  act(() => { action = ui.result.current.surface.handleReadReviewTopic(); });
  try {
    await waitFor(() => expect(operationCount()).toEqual({ n: 1 }));
    expect(requested).toBe(false);
    expect(library.database.prepare('SELECT repetition_count FROM node_reading').get())
      .toEqual({ repetition_count: 1 });
  } finally {
    await act(async () => { position.resolve(); await action; });
  }
});

it('does not replay a saved reading action or advance the resumed session when its old refresh completes', async () => {
  const ui = await setup();
  const refresh = deferred<NonNullable<typeof ui.result.current.snapshot>>();
  const workspace = ui.result.current.workspace;
  workspace.refreshAfterMutation.mockImplementation(async () => {
    const snapshot = await refreshCompanionWorkspaceAfterMutation();
    const count = library.database.prepare('SELECT COUNT(*) FROM daily_flow_operations').pluck().get();
    return count === 1 ? refresh.promise : snapshot;
  });
  let action!: Promise<void>;
  act(() => { action = ui.result.current.surface.handleReadReviewTopic(); });
  await waitFor(() => expect(operationCount()).toEqual({ n: 1 }));
  const durable = (await loadCompanionDailySession())!;
  await act(async () => { ui.result.current.surface.handleTabAction('recent'); });
  await act(async () => { ui.result.current.surface.handleTabAction('review'); });
  await waitFor(() => expect(ui.result.current.surface.flowReady).toBe(true));
  await waitFor(() => expect(ui.result.current.surface.reviewSession.currentCard?.nodeId).toBe(durable.currentNodeId));
  const resumedId = ui.result.current.surface.reviewSession.currentCard?.nodeId;
  const saved = (await refreshCompanionWorkspaceAfterMutation())!;
  await act(async () => { refresh.resolve(saved); await action; });
  expect(ui.result.current.surface.reviewSession.currentCard?.nodeId).toBe(resumedId);
  expect(operationCount()).toEqual({ n: 1 });
});

it('waits for annotation confirmation and blocks reading while content editing is active', async () => {
  const ui = await setup();
  const activity = ui.result.current.surface.readingActivity;
  act(() => activity.setEditing(true));
  await act(() => ui.result.current.surface.handleReadReviewTopic());
  expect(operationCount()).toEqual({ n: 0 });
  act(() => activity.setEditing(false));
  const annotation = deferred<void>();
  const pending = activity.run('selection', () => annotation.promise);
  let action!: Promise<void>;
  act(() => { action = ui.result.current.surface.handleReadReviewTopic(); });
  expect(operationCount()).toEqual({ n: 0 });
  await act(async () => { annotation.resolve(); await pending; await action; });
  expect(operationCount()).toEqual({ n: 1 });
  expect(library.database.prepare('SELECT COUNT(*) AS n FROM node_reading').get()).toEqual({ n: 1 });
});
