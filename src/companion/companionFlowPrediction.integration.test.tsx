// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import type { DbPort } from '../../lib/core/sync/dbPort';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { loadCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';

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
vi.mock('../shared/platform/appLifecycle', () => ({ subscribeNativeAppForeground: async () => () => {} }));

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => {
  library = await createSearchLibrary(3, 32);
  library.database.prepare('UPDATE nodes SET created_at = ?, updated_at = ?').run('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
});
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await library.close(); });

function useSurface(initial: WorkspaceSnapshot, publish: Parameters<typeof useCompanionReadableArticleLoader>[1]) {
  const [state, setState] = useState<NativeCompanionWorkspaceSyncState>(createWorkspaceSync(initial).state);
  const snapshot = state.workspace_snapshot!;
  const flow = useCompanionFlowSession({ snapshot, ready: true, active: true, onlyReview: false, libraryScope: initial.libraryScope ?? 'prediction' });
  const nodeId = flow.view.currentCard?.nodeId ?? null;
  const activity = useMemo(() => new CompanionReadingActivity(nodeId, () => {}), [nodeId]);
  const workspace = createWorkspaceSync(snapshot);
  const snapshotActions = createWorkspaceSnapshotActions({ state, setState, setError: () => {}, setSyncConflictCount: () => {},
    setSyncProgress: () => {}, setStatus: () => {} });
  workspace.refreshAfterMutation.mockImplementation(snapshotActions.refreshAfterMutation);
  const actions = useCompanionSurfaceActions({ flow, snapshot, activity, active: true, workspaceSync: workspace, floatingBar: createFloatingBar() });
  const article = useCompanionReadableArticleLoader(snapshot, publish);
  return { flow, actions, article };
}

it.each(['pending', 'failed'] as const)('displays a committed body and accepts another Soon while future qualification is %s', async failure => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const publish = vi.fn();
  const ui = renderHook(() => useSurface(initial, publish));
  await waitFor(() => expect(ui.result.current.flow.ready).toBe(true));
  const a = ui.result.current.flow.view.currentCard!.nodeId;
  await act(async () => { await ui.result.current.actions.handleSoonReviewTopic(); });
  expect(ui.result.current.actions.readingError).toBeNull();
  const b = ui.result.current.flow.view.currentCard!.nodeId;
  expect(b).not.toBe(a);
  const owner = getIosCompanionDatabaseOwner();
  const original = owner.readInteractiveSnapshot.bind(owner);
  let entered = false;
  vi.spyOn(owner, 'readInteractiveSnapshot').mockImplementation(<T,>(task: (db: DbPort) => Promise<T>, signal?: AbortSignal) =>
    original(db => task({ ...db, async query(sql, params) {
      if (sql.includes('order_key > ?')) {
        entered = true;
        if (failure === 'failed') throw new Error('future qualification failed');
        await new Promise<void>((_resolve, reject) => {
          if (signal?.aborted) reject(signal.reason);
          else signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }
      return db.query(sql, params);
    } }), signal));
  await waitFor(() => expect(entered).toBe(true));
  expect(ui.result.current.actions.isSubmittingReadingAction).toBe(false);
  await act(async () => { await ui.result.current.article.openReadableArticle(b); });
  expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ nodeId: b, content: expect.stringContaining('prefix alpha') }));
  expect((await owner.read(db => readDailyFlow(db)))?.session.currentNodeId).toBe(b);
  await act(async () => { await ui.result.current.actions.handleSoonReviewTopic(); });
  expect(ui.result.current.actions.readingError).toBeNull();
  const c = ui.result.current.flow.view.currentCard!.nodeId;
  expect(c).not.toBe(b);
  expect((await owner.read(db => readDailyFlow(db)))?.session.currentNodeId).toBe(c);
  expect((await loadCompanionFlowHistory(ui.result.current.flow.historyKey)).undoStack).toHaveLength(2);
  ui.unmount();
});
