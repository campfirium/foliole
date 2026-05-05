// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { loadSyncIndex } = vi.hoisted(() => ({
  loadSyncIndex: vi.fn()
}));
const { loadSyncNodes } = vi.hoisted(() => ({
  loadSyncNodes: vi.fn()
}));
const { loadSyncObjects } = vi.hoisted(() => ({
  loadSyncObjects: vi.fn()
}));
const { applySyncNodesAsync } = vi.hoisted(() => ({
  applySyncNodesAsync: vi.fn()
}));
const { applySyncObjectsAsync } = vi.hoisted(() => ({
  applySyncObjectsAsync: vi.fn()
}));
const { recordSyncNodeConflicts } = vi.hoisted(() => ({
  recordSyncNodeConflicts: vi.fn()
}));
const { loadSyncNodeConflicts } = vi.hoisted(() => ({
  loadSyncNodeConflicts: vi.fn()
}));

vi.mock('../database/syncIndex.js', () => ({ loadSyncIndex }));
vi.mock('../database/syncConflictReads.js', () => ({ loadSyncNodeConflicts }));
vi.mock('../database/syncNodes.js', () => ({ loadSyncNodes }));
vi.mock('../database/syncObjects.js', () => ({ loadSyncObjects }));
vi.mock('../database/syncApply.js', () => ({ applySyncNodesAsync }));
vi.mock('../database/syncObjectApply.js', () => ({ applySyncObjectsAsync }));
vi.mock('../database/syncConflicts.js', () => ({ recordSyncNodeConflicts }));
vi.mock('../database/nodeMutations.js', () => ({
  deleteNodesPermanently: vi.fn(),
  flushAllDirtyNodeSyncVersions: vi.fn(),
  replaceNodeOrder: vi.fn(),
  restoreNodes: vi.fn(),
  softDeleteNodes: vi.fn(),
  upsertNodeSnapshot: vi.fn()
}));
vi.mock('../database/backupRestore.js', () => ({
  createApplicationDatabaseBackup: vi.fn(),
  listApplicationDatabaseBackups: vi.fn(),
  restoreApplicationDatabaseBackup: vi.fn()
}));
vi.mock('../database/readingProgress.js', () => ({
  loadReadingProgress: vi.fn(),
  saveReadingProgress: vi.fn()
}));
vi.mock('../database/reviewMutations.js', () => ({
  applyReviewGrade: vi.fn(),
  resetNodeReviewState: vi.fn()
}));
vi.mock('../database/workspaceSnapshot.js', () => ({ loadWorkspaceSnapshot: vi.fn() }));
vi.mock('../database/workspaceListSnapshot.js', () => ({ loadWorkspaceListSnapshot: vi.fn() }));
vi.mock('../database/workspaceNodeDocument.js', () => ({ loadWorkspaceNodeDocument: vi.fn() }));
vi.mock('../database/nodeBacklinks.js', () => ({ loadNodeBacklinks: vi.fn() }));
vi.mock('../database/externalSearchFolders.js', () => ({
  loadExternalSearchFolders: vi.fn(),
  saveExternalSearchFolders: vi.fn()
}));
vi.mock('../database/syncPeers.js', () => ({ loadSyncPeers: vi.fn(), saveSyncPeers: vi.fn() }));
vi.mock('../database/importMaintenance.js', () => ({ resetImportData: vi.fn() }));
vi.mock('../database/workspaceSearch.js', () => ({ searchWorkspace: vi.fn() }));
vi.mock('../externalSearchBackgroundRefreshRuntime.js', () => ({ notifyExternalSearchFoldersChanged: vi.fn() }));
vi.mock('../import/importManagerSettings.js', () => ({
  loadImportManagerSettings: vi.fn(),
  saveImportManagerSettings: vi.fn()
}));
vi.mock('../import/keepImportMonitor.js', () => ({ refreshKeepImportMonitorFromSettings: vi.fn() }));
vi.mock('../import/managedInboxMonitor.js', () => ({ refreshManagedInboxMonitorFromSettings: vi.fn() }));
vi.mock('../import/nodeSourceUpdatePreview.js', () => ({ loadNodeSourceUpdatePreview: vi.fn() }));
vi.mock('../import/readwiseTopicMerge.js', () => ({ mergeReadwiseTopicHighlights: vi.fn() }));
vi.mock('../mirror/exportCurrentArticleMirror.js', () => ({ exportCurrentArticleMirror: vi.fn() }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../mirror/rebuildAttachmentLinks.js', () => ({ rebuildMirrorAttachmentLinks: vi.fn() }));
vi.mock('../mirror/rebuildMirrorOutput.js', () => ({ rebuildMirrorOutput: vi.fn() }));
vi.mock('../reviewSchedulerSettings.js', () => ({
  loadReviewSchedulerSettings: vi.fn(),
  saveReviewSchedulerSettings: vi.fn()
}));
vi.mock('./storage.js', () => ({ loadAppSettingsState: vi.fn(), saveAppSettingsState: vi.fn() }));
vi.mock('./libraryPaths.js', () => ({ loadLibraryPathSettings: vi.fn(), updateLibraryPathSetting: vi.fn() }));
vi.mock('./importOverviewPayload.js', () => ({ toNativeImportOverview: vi.fn() }));
vi.mock('./nodeSourceDetailsPayload.js', () => ({ toNativeNodeSourceDetails: vi.fn() }));
vi.mock('./pdfImportsInventoryPayload.js', () => ({ toNativePdfImportsInventory: vi.fn() }));
vi.mock('./readwiseBooksInventoryPayload.js', () => ({ toNativeReadwiseBooksInventory: vi.fn() }));

import { handleStorageCommand } from './storageCommands.js';

function createSyncNodePayload() {
  return [
    {
      ancestor_version_ids: ['desktop#6'],
      content_hash: 'hash-node-2',
      device_id: 'desktop',
      object_id: 'node-2',
      object_type: 'node',
      parent_version_id: 'desktop#6',
      snapshot: {
        anchor_link: null,
        attachments: [],
        content: 'hello',
        created_at: '2026-04-21T15:00:00.000Z',
        deleted_at: null,
        desired_retention: null,
        hide_title_heading: false,
        id: 'node-2',
        image_regions: null,
        is_title_manual: false,
        kind: 'item',
        opening_text: null,
        parent_id: null,
        position: 3,
        priority: null,
        reveal: null,
        title: 'Node 2',
        updated_at: '2026-04-21T16:10:00.000Z',
        virtual_filter: null
      },
      updated_at: '2026-04-21T16:10:00.000Z',
      version_created_at: '2026-04-21T16:10:00.000Z',
      version_id: 'desktop#7'
    }
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('returns lightweight sync index payload through storage commands', async () => {
  loadSyncIndex.mockReturnValue([
    {
      object_type: 'node',
      object_id: 'node-1',
      sync_version_id: 'desktop-1#7',
      content_hash: 'hash-node-1',
      updated_at: '2026-04-21T16:05:00.000Z'
    }
  ]);

  await expect(handleStorageCommand('load_sync_index', {})).resolves.toEqual([
    {
      object_type: 'node',
      object_id: 'node-1',
      sync_version_id: 'desktop-1#7',
      content_hash: 'hash-node-1',
      updated_at: '2026-04-21T16:05:00.000Z'
    }
  ]);
});

it('returns requested sync node records through storage commands', async () => {
  const payload = createSyncNodePayload();
  loadSyncNodes.mockReturnValue(payload);
  await expect(handleStorageCommand('load_sync_nodes', {
    objectIds: ['node-2']
  })).resolves.toEqual(payload);
  expect(loadSyncNodes).toHaveBeenCalledWith(['node-2']);
});

it('returns requested generic sync object records through storage commands', async () => {
  const payload = [{
    content_hash: 'hash-setting',
    deleted_at: null,
    object_id: 'user_space:windows:desktop:*:app_settings',
    object_type: 'setting' as const,
    payload_json: '{"key":"app_settings"}',
    updated_at: '2026-04-21T16:20:00.000Z'
  }];
  loadSyncObjects.mockReturnValue(payload);

  await expect(handleStorageCommand('load_sync_objects', {
    objectIds: ['user_space:windows:desktop:*:app_settings'],
    objectTypes: ['setting']
  })).resolves.toEqual(payload);
  expect(loadSyncObjects).toHaveBeenCalledWith(['user_space:windows:desktop:*:app_settings'], ['setting']);
});

it('applies sync node payloads through storage commands', async () => {
  const payload = createSyncNodePayload();
  applySyncNodesAsync.mockResolvedValue(['node-2']);
  await expect(handleStorageCommand('apply_sync_nodes', {
    nodes: payload
  })).resolves.toEqual(['node-2']);
  expect(applySyncNodesAsync).toHaveBeenCalledWith(payload);
});


it('applies generic sync object payloads through storage commands', async () => {
  const payload = [{
    content_hash: 'hash-setting',
    deleted_at: null,
    object_id: 'user_space:windows:desktop:*:app_settings',
    object_type: 'setting' as const,
    payload_json: '{"key":"app_settings"}',
    updated_at: '2026-04-21T16:20:00.000Z'
  }];
  applySyncObjectsAsync.mockResolvedValue(['setting:user_space:windows:desktop:*:app_settings']);

  await expect(handleStorageCommand('apply_sync_objects', {
    objects: payload
  })).resolves.toEqual(['setting:user_space:windows:desktop:*:app_settings']);
  expect(applySyncObjectsAsync).toHaveBeenCalledWith(payload);
});

it('records sync node conflict payloads through storage commands', async () => {
  const payload = [{
    conflict_version_id: 'phone#9',
    content_hash: 'hash-conflict',
    device_id: 'phone',
    object_id: 'node-2',
    parent_version_id: 'desktop#7',
    snapshot: createSyncNodePayload()[0].snapshot,
    updated_at: '2026-04-21T16:11:00.000Z'
  }];
  recordSyncNodeConflicts.mockReturnValue(['phone#9']);

  await expect(handleStorageCommand('record_sync_node_conflicts', {
    conflicts: payload
  })).resolves.toEqual(['phone#9']);
  expect(recordSyncNodeConflicts).toHaveBeenCalledWith(payload);
});

it('loads sync node conflicts through storage commands', async () => {
  loadSyncNodeConflicts.mockReturnValue([
    {
      conflict_version_id: 'phone#9',
      content_hash: 'hash-conflict',
      detected_at: '2026-04-21T16:12:00.000Z',
      device_id: 'phone',
      object_id: 'node-2',
      parent_version_id: 'desktop#7',
      snapshot: createSyncNodePayload()[0].snapshot,
      updated_at: '2026-04-21T16:11:00.000Z'
    }
  ]);

  await expect(handleStorageCommand('load_sync_node_conflicts', {
    objectIds: ['node-2']
  })).resolves.toEqual([
    expect.objectContaining({
      conflict_version_id: 'phone#9',
      object_id: 'node-2'
    })
  ]);
  expect(loadSyncNodeConflicts).toHaveBeenCalledWith(['node-2']);
});
