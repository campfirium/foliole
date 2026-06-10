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

  const taskOptionsByLabel = new Map(startupMocks.runStartupTask.mock.calls.map((call) => [call[0], call[2]]));
  expect(startupMocks.startDesktopTaskWatchdog).toHaveBeenCalledTimes(1);
  expect(taskOptionsByLabel.get('[pdf] pending indexing resume failed')).toMatchObject({
    cancellable: false,
    cost: 'light',
    progress: 'none'
  });
  expect(taskOptionsByLabel.get('[search] invalidation scheduler failed')).toMatchObject({ cost: 'light' });
  expect(taskOptionsByLabel.get('[external-search] background refresh scheduler failed')).toMatchObject({ cost: 'light' });
  expect(taskOptionsByLabel.get('[keep-import] startup monitor failed')).toMatchObject({ cost: 'light' });
  expect(taskOptionsByLabel.get('[mirror] startup backfill failed')).toMatchObject({
    cancellable: true,
    cost: 'heavy',
    progress: 'incremental'
  });
  expect(taskOptionsByLabel.has('[readwise-books] startup node sync failed')).toBe(false);
});
