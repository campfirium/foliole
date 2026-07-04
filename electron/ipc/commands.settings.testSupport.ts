import { vi } from 'vitest';

import './commands.settings.companionMocks.testSupport.js';
import './commands.settings.reviewSchedulerMocks.testSupport.js';
import { resetDatabaseReadinessForTests } from '../database/databaseReadiness.js';

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
    getFocusedWindow: vi.fn(() => null)
  },
  app: { getVersion: () => '1.0.0' },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
    openPath: vi.fn().mockResolvedValue('')
  }
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
vi.mock('../sync/lanWorkspaceSyncServer.js', () => ({
  ensureLanWorkspaceSyncServer: vi.fn().mockResolvedValue({
    advertised_urls: ['http://127.0.0.1:38641'],
    last_error: null,
    paired_device_count: 1,
    pending_pair_request_count: 1,
    port: 38641,
    state: 'running'
  }),
  getLanWorkspaceSyncServerStatus: vi.fn().mockReturnValue({
    advertised_urls: ['http://127.0.0.1:38641'],
    last_error: null,
    paired_device_count: 1,
    pending_pair_request_count: 1,
    port: 38641,
    state: 'running'
  }),
  refreshLanWorkspaceSyncServerPairingStatus: vi.fn().mockReturnValue({
    advertised_urls: ['http://127.0.0.1:38641'],
    last_error: null,
    paired_device_count: 1,
    pending_pair_request_count: 0,
    port: 38641,
    state: 'running'
  }),
  stopLanWorkspaceSyncServer: vi.fn().mockResolvedValue({
    advertised_urls: [],
    last_error: null,
    paired_device_count: 0,
    pending_pair_request_count: 0,
    port: null,
    state: 'stopped'
  })
}));
vi.mock('../sync/primaryDeviceState.js', () => ({
  loadDesktopPrimaryDeviceStatePayload: vi.fn().mockReturnValue({
    can_initiate_takeover: false,
    local_role: 'primary',
    primary_device_id: 'device-desktop',
    source: 'desktop-paired-default',
    takeover_blocked_reasons: []
  })
}));
vi.mock('./storage.js', () => ({
  loadAppSettingsState: vi.fn().mockResolvedValue({ 'foliole-ui-font-preset': 'inter' }),
  saveAppSettingsState: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('./libraryPaths.js', () => ({
  loadLibraryPathSettings: vi.fn().mockResolvedValue({
    assets_dir: '/library/Assets',
    data_dir: '/library/Data',
    database_path: '/library/Data/foliole.db',
    inbox: '/library/Inbox',
    library_home: '/library',
    mirror: '/library/Mirror',
    updated_at: '2026-03-30T00:00:00.000Z'
  }),
  openImportRoot: vi.fn().mockResolvedValue(null),
  updateLibraryPathSetting: vi.fn().mockImplementation(({ location, path }) => ({
    assets_dir: location === 'assets_dir' && path ? path : '/library/Assets',
    data_dir: '/library/Data',
    database_path: '/library/Data/foliole.db',
    inbox: location === 'inbox' && path ? path : '/library/Inbox',
    library_home: location === 'library_home' && path ? path : '/library',
    mirror: location === 'mirror' && path ? path : '/library/Mirror',
    updated_at: '2026-03-30T00:05:00.000Z'
  }))
}));
vi.mock('../mirror/rebuildAttachmentLinks.js', () => ({
  rebuildMirrorAttachmentLinks: vi.fn().mockResolvedValue({
    scanned_document_count: 2,
    rewritten_document_count: 1,
    rewritten_link_count: 3,
    updated_at: '2026-03-30T00:20:00.000Z'
  })
}));
vi.mock('../mirror/rebuildMirrorOutput.js', () => ({
  rebuildMirrorOutput: vi.fn().mockResolvedValue({
    queued_article_count: 2,
    rebuilt_article_count: 2,
    failed_article_count: 0,
    pending_article_count: 0,
    updated_at: '2026-03-30T00:25:00.000Z'
  })
}));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({
  scheduleMirrorSync: vi.fn()
}));
vi.mock('../import/importManagerSettings.js', () => ({
  loadImportManagerSettings: vi.fn().mockReturnValue({
    detailsOpen: true,
    readwiseReaderConfig: {
      highlightsHeading: '## Highlights',
      highlightSeparator: '\\n\\n',
      importScope: 'highlights_only',
      newHighlightsHeading: '## New highlights added',
      noteKeyword: 'Note:',
      tagKeyword: 'Tags:',
      validatedAt: ''
    },
    readwiseRootPath: '/tmp/readwise',
    readwiseSources: [],
    sources: [],
    titleStrategy: 'file_name',
    updatedAt: '2026-03-25T00:00:00.000Z',
    version: 4
  }),
  saveImportManagerSettings: vi.fn().mockImplementation((settings) => ({
    ...settings,
    updatedAt: '2026-03-25T00:05:00.000Z',
    version: 4
  }))
}));
vi.mock('../database/reviewMutations.js', () => ({ applyReviewGrade: vi.fn() }));
vi.mock('./boot.js', () => ({ appendBootEvent: vi.fn(), bootReport: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./review.js', () => ({ reviewGrade: vi.fn(), reviewPreview: vi.fn() }));

export function resetCommandsSettingsTestDoubles() {
  vi.clearAllMocks();
  resetDatabaseReadinessForTests();
}

const commandsModulePromise = import('./commands.js');

export async function handleInvokeRequest(...args: Parameters<typeof import('./commands.js').handleInvokeRequest>) {
  const commandsModule = await commandsModulePromise;
  return commandsModule.handleInvokeRequest(...args);
}
