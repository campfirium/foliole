// @vitest-environment node
import { expect, it, vi } from 'vitest';

const startupMocks = vi.hoisted(() => ({
  resumePendingPdfAttachmentIndexing: vi.fn(),
  startExternalSearchBackgroundRefresh: vi.fn(),
  startKeepImportMonitor: vi.fn(),
  startReadwiseApiScheduler: vi.fn(),
  startSearchIndexInvalidationScheduler: vi.fn(),
  submitDesktopOperation: vi.fn(() => ({ promise: Promise.resolve() })),
  startDesktopTaskWatchdog: vi.fn()
}));

vi.mock('./database/backupRestore.js', () => ({ reconcileAutomaticDatabaseBackups: vi.fn() }));
vi.mock('./database/pdfIndexing.js', () => ({ resumePendingPdfAttachmentIndexing: startupMocks.resumePendingPdfAttachmentIndexing }));
vi.mock('./externalSearchBackgroundRefreshRuntime.js', () => ({ startExternalSearchBackgroundRefresh: startupMocks.startExternalSearchBackgroundRefresh }));
vi.mock('./import/keepImportMonitor.js', () => ({ startKeepImportMonitor: startupMocks.startKeepImportMonitor }));
vi.mock('./import/managedInboxMonitor.js', () => ({ startManagedInboxMonitor: vi.fn() }));
vi.mock('./ipc/boot.js', () => ({ appendBootEvent: vi.fn() }));
vi.mock('./ipc/legacyWebviewStorage.js', () => ({ migrateLegacyWebviewStorage: vi.fn() }));
vi.mock('./mirror/rebuildMirrorOutput.js', () => ({ resumePendingMirrorOutput: vi.fn() }));
vi.mock('./database/searchIndexInvalidationScheduler.js', () => ({ startSearchIndexInvalidationScheduler: startupMocks.startSearchIndexInvalidationScheduler }));
vi.mock('./import/readwiseApiScheduler.js', () => ({ startReadwiseApiScheduler: startupMocks.startReadwiseApiScheduler }));
vi.mock('./desktopTaskWatchdog.js', () => ({ startDesktopTaskWatchdog: startupMocks.startDesktopTaskWatchdog }));
vi.mock('./desktopOperations.js', () => ({ submitDesktopOperation: startupMocks.submitDesktopOperation }));

it('starts desktop followup tasks without a Readwise Books inventory write path', async () => {
  const { startFollowupTasks } = await import('./mainFollowupTasks.js');

  startFollowupTasks();
  await Promise.resolve();

  expect(startupMocks.startDesktopTaskWatchdog).toHaveBeenCalledTimes(1);
  expect(startupMocks.resumePendingPdfAttachmentIndexing).toHaveBeenCalledTimes(1);
  expect(startupMocks.startSearchIndexInvalidationScheduler).toHaveBeenCalledTimes(1);
  expect(startupMocks.startExternalSearchBackgroundRefresh).toHaveBeenCalledTimes(1);
  expect(startupMocks.startKeepImportMonitor).toHaveBeenCalledTimes(1);
  expect(startupMocks.startReadwiseApiScheduler).toHaveBeenCalledTimes(1);
  expect(startupMocks.submitDesktopOperation).toHaveBeenCalledWith(
    'mirror-backfill',
    expect.objectContaining({ failureLabel: '[mirror] startup resume failed' })
  );
});
