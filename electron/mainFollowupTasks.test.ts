// @vitest-environment node
import { expect, it, vi } from 'vitest';

const startupMocks = vi.hoisted(() => ({
  runStartupTask: vi.fn(),
  startDesktopTaskWatchdog: vi.fn()
}));

vi.mock('./database/backupRestore.js', () => ({ reconcileAutomaticDatabaseBackups: vi.fn() }));
vi.mock('./database/pdfIndexing.js', () => ({ resumePendingPdfAttachmentIndexing: vi.fn() }));
vi.mock('./externalSearchBackgroundRefreshRuntime.js', () => ({ startExternalSearchBackgroundRefresh: vi.fn() }));
vi.mock('./import/keepImportMonitor.js', () => ({ startKeepImportMonitor: vi.fn() }));
vi.mock('./import/managedInboxMonitor.js', () => ({ startManagedInboxMonitor: vi.fn() }));
vi.mock('./ipc/boot.js', () => ({ appendBootEvent: vi.fn() }));
vi.mock('./ipc/legacyWebviewStorage.js', () => ({ migrateLegacyWebviewStorage: vi.fn() }));
vi.mock('./mirror/rebuildMirrorOutput.js', () => ({ backfillMissingMirrorOutput: vi.fn() }));
vi.mock('./startupTasks.js', () => ({ runStartupTask: startupMocks.runStartupTask }));
vi.mock('./desktopTaskWatchdog.js', () => ({ startDesktopTaskWatchdog: startupMocks.startDesktopTaskWatchdog }));

it('starts desktop followup tasks without a Readwise Books inventory write path', async () => {
  const { startFollowupTasks } = await import('./mainFollowupTasks.js');

  startFollowupTasks();

  const labels = startupMocks.runStartupTask.mock.calls.map((call) => call[0]);
  expect(startupMocks.startDesktopTaskWatchdog).toHaveBeenCalledTimes(1);
  expect(labels).toContain('[pdf] pending indexing resume failed');
  expect(labels).toContain('[search] invalidation scheduler failed');
  expect(labels).toContain('[external-search] background refresh scheduler failed');
  expect(labels).toContain('[keep-import] startup monitor failed');
  expect(labels).not.toContain('[readwise-books] startup node sync failed');
});
