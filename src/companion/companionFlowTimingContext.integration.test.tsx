import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { resolveRuntimeAttachmentResource } from '../shared/platform/attachmentResources';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { timeCompanionActivity } from '../shared/platform/companion/runtime/companionActivityTiming';
import { companionAttachmentDay } from '../shared/platform/companion/runtime/companionAttachmentMaintenance';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';
import { validateAndroidFlowTiming } from '../shared/platform/supportLog/androidFlowTiming';
import { serializeSupportLog, startSupportLog, stopSupportLog } from '../shared/platform/supportLog/supportLog';

import { useDailyFlowSurface } from './companionFlowDay.testSupport';

const key = `${'a'.repeat(64)}.png`;
const secret = 'private.example/secret-path sync-token';
const native = vi.hoisted(() => ({ files: vi.fn(), resolve: vi.fn() }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false,
    convertFileSrc: (url: string) => url },
  registerPlugin: () => ({ ...createCompanionNativeSyncStub(), maintainAttachmentFiles: native.files,
    resolveAttachmentResource: native.resolve }) };
});

class LongTaskObserver {
  static supportedEntryTypes = ['longtask'];
  static emit: ((duration: number) => void) | undefined;
  constructor(private readonly callback: (list: { getEntries(): { duration: number }[] }) => void) {}
  observe() { LongTaskObserver.emit = duration => this.callback({ getEntries: () => [{ duration }] }); }
  takeRecords() { return []; }
  disconnect() { LongTaskObserver.emit = undefined; }
}

function prepareNative() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-26T08:00:00.000Z'));
  vi.stubGlobal('PerformanceObserver', LongTaskObserver);
  hydrateCurrentReviewSchedulerSettings({ newDayStartsAtHour: 4 });
  native.files.mockImplementation(async ({ operation }: { operation: string }) => operation === 'inventory'
    ? { files: [{ storageKey: key, sizeBytes: 4096 }] }
    : { state: JSON.stringify({ lastObservationDay: companionAttachmentDay(new Date()) }) });
  native.resolve.mockResolvedValue({ status: 'ready', mime_type: 'image/png', resource_url: `file:///${secret}`,
    executor_timing: { queue_ms: 140, run_ms: 9 } });
}

type Surface = ReturnType<typeof renderHook<ReturnType<typeof useDailyFlowSurface>, unknown>>;

/** A Read waits behind a held sync writer task, then a Soon scans for its successor. */
async function switchImageCards(ui: Surface, holdWriter: () => { release(): Promise<void> }) {
  const current = ui.result.current.surface.readableArticle!.nodeId;
  const held = holdWriter();
  await act(async () => { await ui.result.current.surface.handleReadReviewTopic(); });
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).not.toBe(current));
  expect(await resolveRuntimeAttachmentResource(`asset://${key}`)).toMatchObject({ status: 'ready' });
  LongTaskObserver.emit?.(180);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  await act(() => held.release());
  await waitFor(() => expect(ui.result.current.snapshot.nodesById[current]?.reading?.repetitionCount).toBe(1));
  const second = ui.result.current.surface.readableArticle!.nodeId;
  await act(async () => { await ui.result.current.surface.handleSoonReviewTopic(); });
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.nodeId).not.toBe(second));
  await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha'));
}

function expectReport(text: string) {
  expect(text).not.toMatch(/private|secret|sync-token|asset:|aaaaaaaa|file:/u);
  const { androidFlow } = JSON.parse(text);
  expect(validateAndroidFlowTiming(androidFlow)).toBe(true);
  const events = androidFlow.events as { operation: number; stage: string; count?: number }[];
  const counted = (stage: string) => events.find(event => event.operation === 2 && event.stage === stage)?.count;
  expect(counted('choose-next-rows')).toBeGreaterThan(0);
  expect(counted('choose-next-batches')).toBeGreaterThan(0);
  expect(events.some(event => event.operation === 1 && /^predict-(hit|miss)$/u.test(event.stage))).toBe(true);
  const card = { images: 2, imageBytes: 4096, unsizedImages: 1, bodyChars: expect.any(Number) };
  expect(androidFlow.cards).toEqual([{ operation: 1, role: 'current', ...card }, { operation: 1, role: 'next', ...card },
    { operation: 2, role: 'current', ...card }, { operation: 2, role: 'next', ...card }]);
  expect(androidFlow.activities).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'native.resolve-resource', queueMs: 140, runMs: 9, status: 'done' }),
    expect.objectContaining({ kind: 'sync', status: 'done' }),
    expect.objectContaining({ kind: 'workspace-refresh' }),
    expect.objectContaining({ kind: 'read-intent' })
  ]));
  expect(androidFlow.writerWaits).toContainEqual(expect.objectContaining({ operation: 1, stage: 'mutation-queue',
    active: expect.arrayContaining(['sync']) }));
  expect(androidFlow.mainThread).toEqual({ source: 'longtask', longTasks: 1, maxMs: 180 });
  expect(androidFlow.session.nodes).toBeGreaterThanOrEqual(8);
  expect(androidFlow.session).toMatchObject({ attachmentFiles: 1, attachmentBytes: 4096, observedToday: true });
  expect(androidFlow.session.sinceDayStartMs).toBeLessThanOrEqual(86_400_000);
}

it('exports card, native file, writer holder, main-thread and library context for an image card switch', async () => {
  prepareNative();
  const library = await createSearchLibrary(8, 32);
  const writable = Promise.withResolvers<void>();
  let blocker: Promise<void> | undefined;
  try {
    library.database.prepare('UPDATE nodes SET created_at = ?, updated_at = ?, content = ?, title = ?').run(
      '2026-10-26T00:00:00.000Z', '2026-10-26T00:00:00.000Z',
      `prefix alpha ![](asset://${key}) ![](https://${secret}.png) body`, secret);
    startSupportLog(false, true);
    const initial = (await refreshCompanionWorkspaceAfterMutation())!;
    const ui = renderHook(() => useDailyFlowSurface(initial));
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha'));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
    await switchImageCards(ui, () => {
      // Fixture stand-in for a sync run that holds the shared writer queue.
      blocker = timeCompanionActivity('sync', () => runCompanionSyncWriterTask(() => writable.promise));
      return { release: async () => { writable.resolve(); await blocker; } };
    });
    stopSupportLog();
    expectReport(serializeSupportLog('android')!);
  } finally {
    stopSupportLog();
    writable.resolve();
    await blocker;
    cleanup();
    await library.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});
