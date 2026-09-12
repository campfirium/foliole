// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

import { handleInvokeRequest } from './commands.js';

const ATTACHMENT_HASH = 'a'.repeat(64);
const ATTACHMENT_STORAGE_KEY = `${ATTACHMENT_HASH}.png`;

function imageImportResult(hash: string, createdAt: string, originalName: string, sizeBytes: number) {
  return {
    status: 'imported', attachment_id: hash, attachment_record: 'created', created_at: createdAt,
    hash, mime_type: 'image/png', original_name: originalName, size_bytes: sizeBytes,
    storage_key: `${hash}.png`, stored_file: 'created'
  };
}

vi.mock('../database/connection.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../database/connection.js')>(),
  runWithDatabaseConnectionOwner: vi.fn((execute: () => unknown) => execute())
}));

const { resolveAttachmentResource } = vi.hoisted(() => ({
  resolveAttachmentResource: vi.fn()
}));

const { importLocalImageAttachment } = vi.hoisted(() => ({
  importLocalImageAttachment: vi.fn()
}));

const { importClipboardImageAttachment } = vi.hoisted(() => ({
  importClipboardImageAttachment: vi.fn()
}));

const { importRemoteImageAttachment } = vi.hoisted(() => ({
  importRemoteImageAttachment: vi.fn()
}));

const { copyAttachmentImageToClipboard, exportAttachmentImage } = vi.hoisted(() => ({
  copyAttachmentImageToClipboard: vi.fn(),
  exportAttachmentImage: vi.fn()
}));

const { exportCurrentArticleMirror } = vi.hoisted(() => ({
  exportCurrentArticleMirror: vi.fn()
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
  upsertNodeSnapshot: vi.fn(),
  upsertNodeSnapshots: vi.fn()
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
vi.mock('../import/keepImportMonitor.js', () => ({
  createKeepImportMonitor: vi.fn(() => ({
    isSnapshotFresh: vi.fn(() => false),
    refreshFromSettings: vi.fn(),
    start: vi.fn(),
    stop: vi.fn()
  })),
  refreshKeepImportMonitorFromSettings: vi.fn()
}));
vi.mock('../import/managedInboxMonitor.js', () => ({ refreshManagedInboxMonitorFromSettings: vi.fn() }));
vi.mock('../import/nodeSourceUpdatePreview.js', () => ({ loadNodeSourceUpdatePreview: vi.fn() }));
vi.mock('../reviewSchedulerSettings.js', () => ({
  loadReviewSchedulerSettings: vi.fn(),
  saveReviewSchedulerSettings: vi.fn()
}));
vi.mock('./boot.js', () => ({ appendBootEvent: vi.fn(), bootReport: vi.fn() }));
vi.mock('./review.js', () => ({ reviewGrade: vi.fn(), reviewPreview: vi.fn() }));
vi.mock('./storage.js', () => ({ loadAppSettingsState: vi.fn(), saveAppSettingsState: vi.fn() }));
vi.mock('../import/keepImportService.js', () => ({ previewKeepImportRule: vi.fn() }));
vi.mock('./importDirectory.js', () => ({ runDirectoryImport: vi.fn() }));
vi.mock('./importTextFile.js', () => ({ runTextFileImport: vi.fn(), selectImportTextFile: vi.fn() }));
vi.mock('./importClipboard.js', () => ({ runClipboardImport: vi.fn() }));
vi.mock('./fonts.js', () => ({ listSystemFonts: vi.fn() }));
vi.mock('./readwiseReaderSetup.js', () => ({ inspectReadwiseReaderSetup: vi.fn() }));
vi.mock('../attachments/resourceResolver.js', () => ({ resolveAttachmentResource }));
vi.mock('../attachments/attachmentImageActions.js', () => ({ copyAttachmentImageToClipboard, exportAttachmentImage }));
vi.mock('../attachments/importLocalImageAttachment.js', () => ({ importLocalImageAttachment }));
vi.mock('../attachments/importClipboardImageAttachment.js', () => ({ importClipboardImageAttachment }));
vi.mock('../attachments/importRemoteImageAttachment.js', () => ({ importRemoteImageAttachment }));
vi.mock('../mirror/exportCurrentArticleMirror.js', () => ({ exportCurrentArticleMirror }));

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
      args: {
        attachment_id: ATTACHMENT_HASH,
        content_hash: ATTACHMENT_HASH,
        library_scope: 'library-scope',
        mime_type: 'image/png',
        storage_key: ATTACHMENT_STORAGE_KEY
      }
    })
  ).resolves.toEqual({
    status: 'ready',
    mime_type: 'image/png',
    resource_url: 'file:///tmp/attachment-1.png'
  });
  expect(resolveAttachmentResource).toHaveBeenCalledWith({
    attachmentId: ATTACHMENT_HASH,
    availability: 'local',
    contentHash: ATTACHMENT_HASH,
    libraryScope: 'library-scope',
    mimeType: 'image/png',
    storageKey: ATTACHMENT_STORAGE_KEY
  });
});

it('routes local image attachment imports through the unified runtime entry', async () => {
  const result = imageImportResult('hash-1', '2026-03-29T00:00:00.000Z', 'cover.png', 12);
  importLocalImageAttachment.mockResolvedValue(result);

  await expect(
    handleInvokeRequest({
      command: NATIVE_COMMANDS.importLocalImageAttachment,
      args: { nodeId: 'node-1', sourcePath: '/tmp/cover.png' }
    })
  ).resolves.toEqual(result);
  expect(importLocalImageAttachment).toHaveBeenCalledWith('node-1', '/tmp/cover.png');
});

it('routes clipboard image attachment imports through the unified runtime entry', async () => {
  const result = imageImportResult('hash-2', '2026-03-30T00:00:00.000Z', 'pasted-image.png', 24);
  importClipboardImageAttachment.mockResolvedValue(result);

  await expect(
    handleInvokeRequest({
      command: NATIVE_COMMANDS.importClipboardImageAttachment,
      args: {
        bytesBase64: 'Y2xpcGJvYXJk',
        mimeType: 'image/png',
        nodeId: 'node-1',
        originalName: ''
      }
    })
  ).resolves.toEqual(result);
  expect(importClipboardImageAttachment).toHaveBeenCalledWith({
    bytesBase64: 'Y2xpcGJvYXJk',
    mimeType: 'image/png',
    nodeId: 'node-1',
    originalName: ''
  });
});

it('routes remote image attachment imports through the unified runtime entry', async () => {
  const result = imageImportResult('hash-3', '2026-03-30T00:00:00.000Z', 'cover.png', 24);
  importRemoteImageAttachment.mockResolvedValue(result);

  await expect(
    handleInvokeRequest({
      command: NATIVE_COMMANDS.importRemoteImageAttachment,
      args: {
        nodeId: 'node-1',
        sourceUrl: 'https://example.com/cover.png'
      }
    })
  ).resolves.toEqual(result);
  expect(importRemoteImageAttachment).toHaveBeenCalledWith({
    nodeId: 'node-1',
    sourceUrl: 'https://example.com/cover.png'
  });
});

it('routes image clipboard and export actions through the unified runtime entry', async () => {
  copyAttachmentImageToClipboard.mockReturnValue({ status: 'copied' });
  exportAttachmentImage.mockResolvedValue({ path: '/tmp/cover.png', status: 'saved' });
  exportCurrentArticleMirror.mockResolvedValue({ path: '/tmp/article.md', status: 'saved' });

  await expect(
    handleInvokeRequest({
      command: NATIVE_COMMANDS.copyAttachmentImageToClipboard,
      args: { attachment_id: 'hash-1' }
    })
  ).resolves.toEqual({ status: 'copied' });
  await expect(
    handleInvokeRequest({
      command: NATIVE_COMMANDS.exportAttachmentImage,
      args: { attachment_id: 'hash-1' }
    })
  ).resolves.toEqual({ path: '/tmp/cover.png', status: 'saved' });

  expect(copyAttachmentImageToClipboard).toHaveBeenCalledWith('hash-1');
  expect(exportAttachmentImage).toHaveBeenCalledWith('hash-1', null);
});

it('routes current article mirror exports through the unified runtime entry', async () => {
  exportCurrentArticleMirror.mockResolvedValue({ path: '/tmp/article.md', status: 'saved' });

  await expect(
    handleInvokeRequest({
      command: NATIVE_COMMANDS.exportCurrentArticleMirror,
      args: { node_id: 'node-1' }
    })
  ).resolves.toEqual({ path: '/tmp/article.md', status: 'saved' });

  expect(exportCurrentArticleMirror).toHaveBeenCalledWith('node-1', null);
});
