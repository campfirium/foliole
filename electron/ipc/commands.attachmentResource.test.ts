// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

import { handleInvokeRequest } from './commands.js';

const { resolveAttachmentResource } = vi.hoisted(() => ({
  resolveAttachmentResource: vi.fn()
}));

const { importLocalImageAttachment } = vi.hoisted(() => ({
  importLocalImageAttachment: vi.fn()
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
    getFocusedWindow: vi.fn(() => null)
  },
  app: { getVersion: () => '1.0.0' },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined), openPath: vi.fn().mockResolvedValue('') }
}));
vi.mock('./menu.js', () => ({ syncAppMenuState: vi.fn() }));
vi.mock('./paths.js', () => ({
  resolveAppPaths: vi.fn().mockReturnValue({
    app_data_dir: '/data',
    app_config_dir: '/config',
    app_cache_dir: '/cache',
    app_log_dir: '/log'
  })
}));
vi.mock('../database/nodeMutations.js', () => ({
  deleteNodesPermanently: vi.fn(),
  replaceNodeOrder: vi.fn(),
  restoreNodes: vi.fn(),
  softDeleteNodes: vi.fn(),
  upsertNodeSnapshot: vi.fn()
}));
vi.mock('../database/reviewMutations.js', () => ({ applyReviewGrade: vi.fn(), resetNodeReviewState: vi.fn() }));
vi.mock('../database/backupRestore.js', () => ({
  createApplicationDatabaseBackup: vi.fn(),
  listApplicationDatabaseBackups: vi.fn(),
  restoreApplicationDatabaseBackup: vi.fn()
}));
vi.mock('../database/importMaintenance.js', () => ({ resetImportData: vi.fn() }));
vi.mock('../database/importOverview.js', () => ({ loadImportOverview: vi.fn() }));
vi.mock('../database/readingProgress.js', () => ({ loadReadingProgress: vi.fn(), saveReadingProgress: vi.fn() }));
vi.mock('../database/workspaceListSnapshot.js', () => ({ loadWorkspaceListSnapshot: vi.fn() }));
vi.mock('../database/workspaceNodeDocument.js', () => ({ loadWorkspaceNodeDocument: vi.fn() }));
vi.mock('../database/workspaceSearch.js', () => ({ searchWorkspace: vi.fn() }));
vi.mock('../database/workspaceSnapshot.js', () => ({ loadWorkspaceSnapshot: vi.fn() }));
vi.mock('../import/importManagerSettings.js', () => ({
  loadImportManagerSettings: vi.fn(),
  saveImportManagerSettings: vi.fn()
}));
vi.mock('../import/keepImportMonitor.js', () => ({ refreshKeepImportMonitorFromSettings: vi.fn() }));
vi.mock('../import/managedInboxMonitor.js', () => ({ refreshManagedInboxMonitorFromSettings: vi.fn() }));
vi.mock('../import/nodeSourceUpdatePreview.js', () => ({ loadNodeSourceUpdatePreview: vi.fn() }));
vi.mock('../reviewSchedulerSettings.js', () => ({
  loadReviewSchedulerSettings: vi.fn(),
  saveReviewSchedulerSettings: vi.fn()
}));
vi.mock('./boot.js', () => ({ bootReport: vi.fn() }));
vi.mock('./review.js', () => ({ reviewGrade: vi.fn(), reviewPreview: vi.fn() }));
vi.mock('./storage.js', () => ({ loadAppSettingsState: vi.fn(), saveAppSettingsState: vi.fn() }));
vi.mock('../import/keepImportService.js', () => ({ previewKeepImportRule: vi.fn() }));
vi.mock('./importDirectory.js', () => ({ runDirectoryImport: vi.fn() }));
vi.mock('./importTextFile.js', () => ({ runTextFileImport: vi.fn(), selectImportTextFile: vi.fn() }));
vi.mock('./fonts.js', () => ({ listSystemFonts: vi.fn() }));
vi.mock('./readwiseReaderSetup.js', () => ({ inspectReadwiseReaderSetup: vi.fn() }));
vi.mock('../attachments/resourceResolver.js', () => ({ resolveAttachmentResource }));
vi.mock('../attachments/importLocalImageAttachment.js', () => ({ importLocalImageAttachment }));

beforeEach(() => {
  vi.clearAllMocks();
});

it('routes attachment resource requests through the unified runtime entry', async () => {
  resolveAttachmentResource.mockReturnValue({
    status: 'ready',
    mime_type: 'image/png',
    resource_url: 'file:///tmp/attachment-1.png'
  });

  await expect(
    handleInvokeRequest({
      command: NATIVE_COMMANDS.resolveAttachmentResource,
      args: { attachment_id: 'hash-1' }
    })
  ).resolves.toEqual({
    status: 'ready',
    mime_type: 'image/png',
    resource_url: 'file:///tmp/attachment-1.png'
  });
  expect(resolveAttachmentResource).toHaveBeenCalledWith('hash-1');
});

it('routes local image attachment imports through the unified runtime entry', async () => {
  importLocalImageAttachment.mockResolvedValue({
    status: 'imported',
    attachment_id: 'hash-1',
    attachment_record: 'created',
    created_at: '2026-03-29T00:00:00.000Z',
    hash: 'hash-1',
    mime_type: 'image/png',
    original_name: 'cover.png',
    size_bytes: 12,
    stored_file: 'created'
  });

  await expect(
    handleInvokeRequest({
      command: NATIVE_COMMANDS.importLocalImageAttachment,
      args: { nodeId: 'node-1', sourcePath: '/tmp/cover.png' }
    })
  ).resolves.toEqual({
    status: 'imported',
    attachment_id: 'hash-1',
    attachment_record: 'created',
    created_at: '2026-03-29T00:00:00.000Z',
    hash: 'hash-1',
    mime_type: 'image/png',
    original_name: 'cover.png',
    size_bytes: 12,
    stored_file: 'created'
  });
  expect(importLocalImageAttachment).toHaveBeenCalledWith('node-1', '/tmp/cover.png');
});
