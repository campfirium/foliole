// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import {
  handleInvokeRequest,
  refreshGlobalClipShortcutMock,
  resetCommandsSettingsTestDoubles
} from './commands.settings.testSupport.js';
import { openImportRoot, updateLibraryPathSetting } from './libraryPaths.js';

const RELEASE_GATE_TEST_TIMEOUT_MS = 30_000;

beforeEach(() => {
  resetCommandsSettingsTestDoubles();
});

async function expectLibraryPathCommands() {
  await expect(handleInvokeRequest({ command: 'load_library_path_settings' })).resolves.toMatchObject({
    assets_dir: '/library/Assets',
    library_home: '/library',
    inbox: '/library/Inbox',
    mirror: '/library/Mirror'
  });
  await expect(handleInvokeRequest({ command: 'open_import_root' })).resolves.toBeNull();
  expect(openImportRoot).toHaveBeenCalledOnce();
  await expect(handleInvokeRequest({ command: 'rebuild_mirror_output' })).resolves.toMatchObject({
    queued_article_count: 2,
    rebuilt_article_count: 2,
    failed_article_count: 0,
    pending_article_count: 0
  });
  await expect(handleInvokeRequest({ command: 'rebuild_mirror_attachment_links' })).resolves.toMatchObject({
    scanned_document_count: 2,
    rewritten_document_count: 1,
    rewritten_link_count: 3
  });
  await expect(
    handleInvokeRequest({ command: 'update_library_path_setting', args: { location: 'mirror', path: '/mirror-vault' } })
  ).resolves.toMatchObject({ mirror: '/mirror-vault' });
  await expect(
    handleInvokeRequest({
      command: 'update_library_path_setting',
      args: { location: 'library_home', path: '/library-next' }
    })
  ).resolves.toMatchObject({ library_home: '/library-next' });
  await expect(
    handleInvokeRequest({
      command: 'update_library_path_setting',
      args: { location: 'assets_dir', path: '/attachment-vault' }
    })
  ).resolves.toMatchObject({ assets_dir: '/attachment-vault' });
  await expect(
    handleInvokeRequest({
      command: 'update_library_path_setting',
      args: { location: 'cache_dir', path: '/cache-vault' }
    })
  ).rejects.toThrow('invalid argument: location');
  expect(vi.mocked(updateLibraryPathSetting)).not.toHaveBeenCalledWith({
    location: 'cache_dir',
    path: '/cache-vault'
  });
}

async function expectSyncAndAppSettingsCommands() {
  await expect(handleInvokeRequest({ command: 'load_app_settings_state' })).resolves.toEqual({
    'foliole-ui-font-preset': 'inter'
  });
  await expect(handleInvokeRequest({ command: 'load_sync_peers' })).resolves.toEqual([
    {
      peer_id: 'android-1',
      status: 'paired',
      last_synced_at: '2026-04-21T16:30:00.000Z',
      last_seen_version_cursor: 'desktop-1#42',
      updated_at: '2026-04-21T16:30:00.000Z'
    }
  ]);
  await expect(
    handleInvokeRequest({
      command: 'save_sync_peers',
      args: {
        peers: [
          {
            peer_id: 'android-2',
            status: 'stale',
            last_synced_at: null,
            last_seen_version_cursor: 'desktop-1#55',
            updated_at: 'ignored'
          }
        ]
      }
    })
  ).resolves.toEqual([
    {
      peer_id: 'android-2',
      status: 'stale',
      last_synced_at: null,
      last_seen_version_cursor: 'desktop-1#55',
      updated_at: '2026-04-21T16:35:00.000Z'
    }
  ]);
  await expect(
    handleInvokeRequest({
      command: 'save_app_settings_state',
      args: { settings: { 'foliole-ui-font-preset': 'source-sans' } }
    })
  ).resolves.toBeNull();
  expect(refreshGlobalClipShortcutMock).toHaveBeenCalledOnce();
  await expect(handleInvokeRequest({ command: 'load_companion_pairing_overview' }))
    .rejects.toThrow('unsupported native command');
}

async function expectImportSettingsCommands() {
  await expect(handleInvokeRequest({ command: 'load_import_manager_settings' })).resolves.toMatchObject({
    detailsOpen: true,
    readwiseRootPath: '/tmp/readwise'
  });
  await expect(
    handleInvokeRequest({
      command: 'save_import_manager_settings',
      args: {
        settings: {
          detailsOpen: false,
          readwiseReaderConfig: {
            highlightsHeading: '## Highlights',
            highlightSeparator: '\\n\\n',
            importScope: 'all',
            newHighlightsHeading: '## New highlights added',
            noteKeyword: 'Note:',
            tagKeyword: 'Tags:',
            validatedAt: '2026-03-25T00:02:00.000Z'
          },
          readwiseRootPath: '/tmp/readwise-next',
          readwiseSources: [],
          sources: [],
          titleStrategy: 'heading'
        }
      }
    })
  ).resolves.toMatchObject({
    detailsOpen: false,
    readwiseReaderConfig: {
      highlightsHeading: '## Highlights',
      highlightSeparator: '\\n\\n',
      importScope: 'all',
      newHighlightsHeading: '## New highlights added',
      noteKeyword: 'Note:',
      tagKeyword: 'Tags:',
      validatedAt: '2026-03-25T00:02:00.000Z'
    },
    readwiseRootPath: '/tmp/readwise-next',
    titleStrategy: 'heading',
    updatedAt: '2026-03-25T00:05:00.000Z'
  });
}

it('handles app, sync peer, library path, and import settings commands', async () => {
  await expectSyncAndAppSettingsCommands();
  await expectLibraryPathCommands();
  await expectImportSettingsCommands();
}, RELEASE_GATE_TEST_TIMEOUT_MS);
