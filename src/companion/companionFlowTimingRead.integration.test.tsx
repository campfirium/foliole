import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';
import { serializeSupportLog, startSupportLog, stopSupportLog } from '../shared/platform/supportLog/supportLog';

import { useDailyFlowSurface } from './companionFlowDay.testSupport';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub };
});

it('keeps the early Read body and delayed SQLite commit on the same exported action', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-26T08:00:00.000Z'));
  hydrateCurrentReviewSchedulerSettings({ newDayStartsAtHour: 4 });
  const library = await createSearchLibrary(8, 32);
  const writable = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  let blocker: Promise<void> | undefined;
  try {
    library.database.prepare('UPDATE nodes SET created_at = ?, updated_at = ?')
      .run('2026-10-26T00:00:00.000Z', '2026-10-26T00:00:00.000Z');
    const initial = (await refreshCompanionWorkspaceAfterMutation())!;
    const ui = renderHook(() => useDailyFlowSurface(initial));
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha'));
    const current = ui.result.current.surface.readableArticle!.nodeId;
    const operationCount = library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations');
    const realTime = performance.now.bind(performance);
    let extraMs = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => realTime() + extraMs);
    blocker = runCompanionSyncWriterTask(() => { entered.resolve(); return writable.promise; });
    await entered.promise;
    startSupportLog(false, true);
    await act(async () => { await ui.result.current.surface.handleReadReviewTopic(); });
    await waitFor(() => {
      const article = ui.result.current.surface.readableArticle;
      expect(article?.nodeId).not.toBe(current);
      expect(article?.content).toContain('prefix alpha');
    });
    expect(operationCount.get()).toEqual({ n: 0 });
    extraMs += 2_000;
    await act(async () => { writable.resolve(); await blocker; });
    await waitFor(() => expect(operationCount.get()).toEqual({ n: 1 }));
    await act(async () => { await runCompanionSyncWriterTask(async () => undefined); });
    await waitFor(() => expect(ui.result.current.snapshot.nodesById[current]?.reading?.repetitionCount).toBe(1));

    stopSupportLog();
    const { androidFlow } = JSON.parse(serializeSupportLog('android')!);
    expect(new Set(androidFlow.events.map((event: { operation: number }) => event.operation))).toEqual(new Set([1]));
    const stamp = (stage: string, status: string) => {
      const event = androidFlow.events.find((entry: { stage: string; status: string }) => entry.stage === stage && entry.status === status);
      expect(event, `${stage} / ${status}`).toBeDefined();
      return event.atMs as number;
    };
    expect(stamp('read-journal', 'done')).toBeLessThanOrEqual(stamp('body', 'done'));
    expect(stamp('body', 'done')).toBeLessThan(stamp('write', 'start'));
    expect(stamp('mutation-queue', 'done') - stamp('mutation-queue', 'start')).toBeGreaterThanOrEqual(2_000);
    expect(stamp('write', 'done') - stamp('write', 'start')).toBeLessThan(2_000);
    expect(stamp('read-background', 'done')).toBeGreaterThanOrEqual(stamp('write', 'done'));
  } finally {
    stopSupportLog();
    writable.resolve();
    await blocker;
    cleanup();
    await library.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});
