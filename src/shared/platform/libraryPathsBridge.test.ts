import { beforeEach, expect, it, vi } from 'vitest';

import type { ElectronAPI } from './electronApi';
import {
  loadRuntimeLibraryPathSettings,
  rebuildRuntimeMirrorAttachmentLinks,
  rebuildRuntimeMirrorOutput,
  updateRuntimeLibraryPathSetting
} from './libraryPathsBridge';

function createMockElectronApi(invoke: ElectronAPI['invoke']): ElectronAPI {
  return {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.electronAPI = undefined;
});

it('loads runtime library paths through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    assets_dir: '/library/Assets',
    data_dir: '/library/Data',
    database_path: '/library/Data/foliole.db',
    inbox: '/library/Inbox',
    library_home: '/library',
    mirror: '/library/Mirror',
    updated_at: '2026-03-30T00:00:00.000Z'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadRuntimeLibraryPathSettings()).resolves.toEqual({
    assetsDir: '/library/Assets',
    dataDir: '/library/Data',
    databasePath: '/library/Data/foliole.db',
    inbox: '/library/Inbox',
    libraryHome: '/library',
    mirror: '/library/Mirror',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });
  expect(invoke).toHaveBeenCalledWith('load_library_path_settings');
});

it('updates a library path through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    assets_dir: '/library/Assets',
    data_dir: '/library/Data',
    database_path: '/library/Data/foliole.db',
    inbox: '/capture/Inbox',
    library_home: '/library',
    mirror: '/library/Mirror',
    updated_at: '2026-03-30T00:10:00.000Z'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(updateRuntimeLibraryPathSetting('inbox', '/capture/Inbox')).resolves.toMatchObject({
    inbox: '/capture/Inbox'
  });
  expect(invoke).toHaveBeenCalledWith('update_library_path_setting', {
    location: 'inbox',
    path: '/capture/Inbox'
  });
});

it('rebuilds mirror attachment links through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    scanned_document_count: 2,
    rewritten_document_count: 1,
    rewritten_link_count: 3,
    updated_at: '2026-03-30T00:20:00.000Z'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(rebuildRuntimeMirrorAttachmentLinks()).resolves.toEqual({
    scannedDocumentCount: 2,
    rewrittenDocumentCount: 1,
    rewrittenLinkCount: 3,
    updatedAt: '2026-03-30T00:20:00.000Z'
  });
  expect(invoke).toHaveBeenCalledWith('rebuild_mirror_attachment_links');
});

it('rebuilds mirror output through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    queued_article_count: 4,
    rebuilt_article_count: 4,
    failed_article_count: 0,
    pending_article_count: 0,
    updated_at: '2026-03-30T00:15:00.000Z'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(rebuildRuntimeMirrorOutput()).resolves.toEqual({
    queuedArticleCount: 4,
    rebuiltArticleCount: 4,
    failedArticleCount: 0,
    pendingArticleCount: 0,
    updatedAt: '2026-03-30T00:15:00.000Z'
  });
  expect(invoke).toHaveBeenCalledWith('rebuild_mirror_output');
});

it('returns null when the runtime library path payload is malformed', async () => {
  const invoke = vi.fn().mockResolvedValue({ library_home: '/library' });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadRuntimeLibraryPathSettings()).resolves.toBeNull();
  expect(warn).toHaveBeenCalledWith(
    '[bridge] native library path payload invalid',
    expect.objectContaining({
      action: 'load_runtime_library_path_settings',
      area: 'bridge',
      command: 'load_library_path_settings',
      fallback: 'return_null'
    })
  );
});
