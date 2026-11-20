import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { hashTextBody } from '../../lib/core/database/textBodyHash';
import { hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { runCompanionAttachmentMaintenance } from '../shared/platform/companion/runtime/companionAttachmentMaintenance';
import { installCompanionAttachmentTestWorker } from '../shared/platform/companion/runtime/companionAttachmentWorker.testSupport';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { serializeSupportLog, startSupportLog, stopSupportLog } from '../shared/platform/supportLog/supportLog';

import { useDailyFlowSurface } from './companionFlowDay.testSupport';

const maintenanceFiles = vi.hoisted(() => vi.fn());
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: () => ({ ...createCompanionNativeSyncStub(), maintainAttachmentFiles: maintenanceFiles }) };
});

it('advances a text card and saves Soon exactly once while attachment observation waits for the native file', async () => {
  const writingState = Promise.withResolvers<void>();
  const releaseFile = Promise.withResolvers<void>();
  maintenanceFiles.mockImplementation(async ({ operation }) => {
    if (operation === 'generation') return { generation: 'fixture' };
    if (operation === 'read-state') return { state: null };
    if (operation === 'inventory') return { files: [] };
    if (operation !== 'write-state') throw new Error(operation);
    writingState.resolve();
    await releaseFile.promise;
    return {};
  });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-26T08:00:00.000Z'));
  hydrateCurrentReviewSchedulerSettings({ newDayStartsAtHour: 4 });
  const worker = await installCompanionAttachmentTestWorker();
  const library = await createSearchLibrary(2, 32);
  const operations = library.database.prepare('SELECT COUNT(*) AS n FROM daily_flow_operations');
  let maintenance: Promise<unknown> | undefined;
  let action: Promise<void> | undefined;
  try {
    const setBody = library.database.prepare('UPDATE nodes SET body_blob_hash=?, created_at=?, updated_at=? WHERE id=?');
    for (const { id, content } of library.database.prepare<[], { id: string; content: string }>('SELECT id, content FROM nodes').all()) {
      setBody.run(hashTextBody(content), '2026-10-26T00:00:00Z', '2026-10-26T00:00:00Z', id);
    }
    const initial = (await refreshCompanionWorkspaceAfterMutation())!;
    const ui = renderHook(() => useDailyFlowSurface(initial));
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha'));
    const first = ui.result.current.surface.readableArticle!.nodeId;
    const observing = runCompanionAttachmentMaintenance({ action: 'observe' });
    maintenance = observing.catch(() => undefined);
    expect(await Promise.race([writingState.promise.then(() => 'file pending'), observing])).toBe('file pending');
    startSupportLog(false, true);
    act(() => { action = ui.result.current.surface.handleSoonReviewTopic(); });
    await waitFor(() => {
      expect(ui.result.current.surface.isSubmittingReadingAction).toBe(false);
      expect(ui.result.current.surface.readableArticle?.nodeId).toBeDefined();
      expect(ui.result.current.surface.readableArticle?.nodeId).not.toBe(first);
      expect(ui.result.current.surface.readableArticle?.content).toContain('prefix alpha');
      expect(operations.get()).toEqual({ n: 1 });
    });
    stopSupportLog();
    expectAttachmentFlowRecording(first);
    releaseFile.resolve();
    await expect(observing).resolves.toEqual({ observationComplete: true });
    expect(operations.get()).toEqual({ n: 1 });
  } finally {
    await act(async () => { releaseFile.resolve(); await Promise.all([maintenance, action]); });
    stopSupportLog();
    cleanup();
    await library.close();
    await worker.close();
    vi.useRealTimers();
  }
});

function expectAttachmentFlowRecording(first: string) {
  const exported = serializeSupportLog('android')!;
  expect(exported).not.toContain('prefix alpha');
  expect(exported).not.toContain(first);
  const { androidFlow } = JSON.parse(exported);
  expect(androidFlow.attachments).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'observe', fromMs: 0, status: 'pending' }),
    expect.objectContaining({ kind: 'file.write-state', fromMs: 0, status: 'pending' })
  ]));
  expect(androidFlow.events).toEqual(expect.arrayContaining([
    ...['action', 'open-queue', 'open-writer', 'mutation-queue', 'mutation-writer', 'write', 'choose-next', 'display', 'body']
      .map(stage => expect.objectContaining({ operation: 1, action: 'soon', stage, status: 'done' }))
  ]));
  expect(androidFlow.events).not.toEqual(expect.arrayContaining([expect.objectContaining({ stage: 'queue-build' })]));
}
