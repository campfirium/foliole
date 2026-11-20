// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { holdCompanionSyncAppliedRefresh, registerCompanionSyncAppliedRefresh } from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { loadCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';
import { node, open, act as peerAction } from '../test/dailyFlowExceptions.testSupport';

import { useDailyFlowSurface } from './companionFlowDay.testSupport';

vi.hoisted(() => { vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor); });
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/companion/runtime/companionDailyFlow', async importOriginal => {
  const actual = await importOriginal<typeof import('../shared/platform/companion/runtime/companionDailyFlow')>();
  return { ...actual, openCompanionDailyFlow: vi.fn(actual.openCompanionDailyFlow) };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => {
  library = await createSearchLibrary(8, 32);
  library.database.prepare('UPDATE nodes SET created_at = ?, updated_at = ?')
    .run('2026-10-26T00:00:00.000Z', '2026-10-26T00:00:00.000Z');
});
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await library.close(); });

const submits = { later: 'handlePostponeReviewTopic', dismiss: 'handleDismissReviewTopic', soon: 'handleSoonReviewTopic' } as const;
const opens = vi.mocked(openCompanionDailyFlow);
const commits = () => (library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations').get() as { n: number }).n;

async function renderFlow() {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const ui = renderHook(() => useDailyFlowSurface(initial));
  await waitFor(() => expect(ui.result.current.surface.readableArticle).not.toBeNull());
  return ui;
}

async function tap(ui: Awaited<ReturnType<typeof renderFlow>>, action: keyof typeof submits) {
  const source = ui.result.current.surface.readableArticle!.nodeId;
  await act(async () => { await ui.result.current.surface[submits[action]](); });
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).not.toBe(source));
  // Let a snapshot-driven Flow refresh start and finish before the next tap.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
}

it.each(['later', 'dismiss', 'soon'] as const)('commits consecutive %s taps without reopening the daily Flow', async action => {
  const ui = await renderFlow();
  await tap(ui, action);
  for (let index = 0; index < 3; index += 1) {
    opens.mockClear();
    const before = commits();
    await tap(ui, action);
    expect(commits()).toBe(before + 1);
    expect(opens).not.toHaveBeenCalled();
  }
  expect(ui.result.current.surface.readingError).toBeNull();
  ui.unmount();
});

it('reopens before the next tap when a sync lands while the workspace refresh is held', async () => {
  await library.close();
  library = await createSearchLibrary(0);
  const peers = await connectCompanionPeer(library);
  try {
    for (const id of ['a', 'b', 'c', 'd']) node(peers.desktop, id, 'topic');
    await peers.exchange();
    const ui = await renderFlow();
    await tap(ui, 'later');
    const source = ui.result.current.surface.readableArticle!.nodeId;
    const key = ui.result.current.surface.flowHistoryKey;
    const history = (await loadCompanionFlowHistory(key)).undoStack.length;
    const release = holdCompanionSyncAppliedRefresh();
    try {
      // Another writer handles the displayed topic; the snapshot stays put until the sync run lets go.
      const stored = await open(peers.mobile, new Date().toISOString());
      expect(stored.currentNodeId).toBe(source);
      await peerAction(peers.mobile, stored, 'read', new Date().toISOString());
      registerCompanionSyncAppliedRefresh({ kind: 'nodes', nodeIds: [source] });
      opens.mockClear();
      await act(async () => { await ui.result.current.surface.handlePostponeReviewTopic(); });
      expect(opens).toHaveBeenCalled();
      expect(ui.result.current.surface.readingError).toBeNull();
      await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).not.toBe(source));
      expect((await loadCompanionFlowHistory(key)).undoStack).toHaveLength(history);
    } finally { release(); }
    ui.unmount();
  } finally { vi.unstubAllGlobals(); await closeLibraries(); }
});
