import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { SOURCE_OWNERSHIP_SYNC_FEATURE } from '../../lib/platform/syncAdvertisedFeatures.js';

import { openDatabaseConnection } from './connection.js';
import { buildDesktopSyncPack } from './syncPackBuilder.js';
import {
  insertAttachmentSyncState,
  insertExternalFolderSyncState,
  insertImportSourceSyncState,
  insertNodeReadingSyncState,
  insertNodeReviewSyncState,
  insertPdfPageTextSyncState,
  insertViewStateSyncState,
  mockedSyncPackBuilderAppDataDir,
  readPackRows,
  resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle
} from './syncPackBuilderTestSupport.js';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedSyncPackBuilderAppDataDir,
    app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
    app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
    app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
  })
}));

setupSyncPackBuilderTestLifecycle();

it('packs attachment metadata as a generic sync object', async () => {
  insertAttachmentSyncState();
  const packPath = resolveSyncPackPath('incoming-attachment.db');

  const result = await buildDesktopSyncPack({ outputPath: packPath, packId: 'pack-attachment-1', fromStateSeq: 0 });

  expect(result).toMatchObject({ objectCount: 1, packId: 'pack-attachment-1', toStateSeq: 3 });
  expect(readPackRows(packPath)).toMatchObject({
    manifest: expect.objectContaining({
      advertised_features: [SOURCE_OWNERSHIP_SYNC_FEATURE],
      tables: [
        { name: 'sync_groups', row_count: 0 },
        { name: 'sync_group_members', row_count: 0 },
        { name: 'sync_group_member_departures', row_count: 0 },
        { name: 'sync_object_state', row_count: 1 },
        { name: 'sync_objects', row_count: 1 },
        { name: 'nodes', row_count: 0 },
        { name: 'node_sync_versions', row_count: 0 },
        { name: 'node_sync_version_parents', row_count: 0 },
        { name: 'node_order', row_count: 0 },
        { name: 'node_attachments', row_count: 0 },
        { name: 'external_documents', row_count: 0 },
        { name: 'content_blobs', row_count: 0 },
        { name: 'review_log', row_count: 0 }
      ]
    }),
    stateRows: [{ object_id: 'att-1', object_type: 'attachment', state_seq: 3 }],
    syncObjects: [expect.objectContaining({
      object_id: 'att-1',
      object_type: 'attachment',
      payload_json: expect.stringContaining('cover.png')
    })]
  });

});

it('packs watched folder ownership as a generic sync object', async () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO watched_folder_bindings (
      binding_id, owner_installation_id, owner_device_name, owner_platform,
      action_mode, archive_path, highlight_mode, highlight_path, keep_preview_json, primary_path,
      enabled, availability, created_at, updated_at
    ) VALUES ('watched-1', 'desktop-installation-a', 'Mac A', 'darwin',
      'keep', '', 'merged', '', NULL, '/Users/a/Inbox', 1, 'available',
      '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z')`
  );
  driver.execute(
    `INSERT INTO sync_object_state (
      object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
    ) VALUES ('watched_folder', 'watched-1', 8, 'watched-hash', 'desktop-a',
      '2026-08-17T00:00:00.000Z', 1)`
  );
  const packPath = resolveSyncPackPath('incoming-watched-folder.db');

  await buildDesktopSyncPack({ outputPath: packPath, packId: 'pack-watched-folder-1', fromStateSeq: 0 });

  expect(readPackRows(packPath)).toMatchObject({
    stateRows: [{ object_id: 'watched-1', object_type: 'watched_folder', state_seq: 8 }],
    syncObjects: [expect.objectContaining({
      object_id: 'watched-1', object_type: 'watched_folder', payload_json: expect.stringContaining('desktop-installation-a')
    })]
  });
  driver.execute(
    `INSERT INTO sync_groups (group_id, display_name, timeline_id, created_by_device_id, created_at, updated_at)
     VALUES ('group-mobile', 'Devices', 'timeline-mobile', 'desktop-a',
       '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z')`
  );
  driver.execute(
    `INSERT INTO sync_group_members (
      group_id, device_id, device_kind, device_name, state, approved_by_device_id,
      authorization_id, joined_at, updated_at
    ) VALUES ('group-mobile', 'android-a', 'android-capacitor', 'Phone', 'active', 'desktop-a',
      'auth-android-a', '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z')`
  );
  const mobilePackPath = resolveSyncPackPath('incoming-watched-folder-mobile.db');
  await buildDesktopSyncPack({
    outputPath: mobilePackPath, packId: 'pack-watched-folder-mobile', fromStateSeq: 0, toPeerId: 'android-a'
  });
  expect(readPackRows(mobilePackPath)).toMatchObject({ stateRows: [], syncObjects: [] });
});

it('packs external folder metadata as a generic sync object', async () => {
  insertExternalFolderSyncState();
  const packPath = resolveSyncPackPath('incoming-external-folder.db');

  const result = await buildDesktopSyncPack({ outputPath: packPath, packId: 'pack-external-folder-1', fromStateSeq: 0 });

  expect(result).toMatchObject({ objectCount: 1, packId: 'pack-external-folder-1', toStateSeq: 4 });
  expect(readPackRows(packPath)).toMatchObject({
    stateRows: [{ object_id: 'folder-1', object_type: 'external_folder', state_seq: 4 }],
    syncObjects: [expect.objectContaining({
      object_id: 'folder-1',
      object_type: 'external_folder',
      payload_json: expect.stringContaining('/library')
    })]
  });
});

it('packs import source metadata as a generic sync object', async () => {
  insertImportSourceSyncState();
  const packPath = resolveSyncPackPath('incoming-import-source.db');

  const result = await buildDesktopSyncPack({ outputPath: packPath, packId: 'pack-import-source-1', fromStateSeq: 0 });

  expect(result).toMatchObject({ objectCount: 1, packId: 'pack-import-source-1', toStateSeq: 5 });
  expect(readPackRows(packPath)).toMatchObject({
    stateRows: [{ object_id: 'source-1', object_type: 'import_source', state_seq: 5 }],
    syncObjects: [expect.objectContaining({
      object_id: 'source-1',
      object_type: 'import_source',
      payload_json: expect.stringContaining('notes.md')
    })]
  });
});

it('packs pdf page text as a generic sync object', async () => {
  insertPdfPageTextSyncState();
  const packPath = resolveSyncPackPath('incoming-pdf-page-text.db');

  const result = await buildDesktopSyncPack({ outputPath: packPath, packId: 'pack-pdf-page-text-1', fromStateSeq: 0 });

  expect(result).toMatchObject({ objectCount: 1, packId: 'pack-pdf-page-text-1', toStateSeq: 7 });
  expect(readPackRows(packPath)).toMatchObject({
    stateRows: [{ object_id: 'pdf-1:1', object_type: 'pdf_page_text', state_seq: 7 }],
    syncObjects: [expect.objectContaining({
      object_id: 'pdf-1:1',
      object_type: 'pdf_page_text',
      payload_json: expect.stringContaining('page text')
    })]
  });
});

it('packs review log rows with changed node review state', async () => {
  insertNodeReviewSyncState();
  const packPath = resolveSyncPackPath('incoming-review-log.db');

  const result = await buildDesktopSyncPack({ outputPath: packPath, packId: 'pack-review-log-1', fromStateSeq: 0 });

  expect(result).toMatchObject({ objectCount: 2, packId: 'pack-review-log-1', toStateSeq: 6 });
  expect(readPackRows(packPath)).toMatchObject({
    manifest: expect.objectContaining({ tables: expect.arrayContaining([{ name: 'review_log', row_count: 1 }]) }),
    reviewLog: [{ grade: 3, node_id: 'node-review-1', op_id: 'op-1' }],
    stateRows: [
      { object_id: 'node-review-1', object_type: 'node', state_seq: 1 },
      { object_id: 'node-review-1', object_type: 'node_review', state_seq: 6 }
    ],
    syncObjects: [expect.objectContaining({
      object_id: 'node-review-1',
      object_type: 'node_review',
      payload_json: expect.stringContaining('last_review_at')
    })]
  });
});

it('packs node reading state as a generic sync object', async () => {
  insertNodeReadingSyncState();
  const packPath = resolveSyncPackPath('incoming-node-reading.db');

  const result = await buildDesktopSyncPack({ outputPath: packPath, packId: 'pack-node-reading-1', fromStateSeq: 0 });

  expect(result).toMatchObject({ objectCount: 2, packId: 'pack-node-reading-1', toStateSeq: 8 });
  expect(readPackRows(packPath)).toMatchObject({
    nodes: [expect.objectContaining({ id: 'node-reading-1' })],
    stateRows: [
      { object_id: 'node-reading-1', object_type: 'node', state_seq: 1 },
      { object_id: 'node-reading-1', object_type: 'node_reading', state_seq: 8 }
    ],
    syncObjects: [expect.objectContaining({
      object_id: 'node-reading-1',
      object_type: 'node_reading',
      payload_json: expect.stringContaining('interval_duration_ms')
    })]
  });
});

it('omits stale node reading state without a backing reading row', async () => {
  insertNodeReadingSyncState();
  openDatabaseConnection().driver.execute(
    "DELETE FROM node_reading WHERE node_id = 'node-reading-1'"
  );
  const packPath = resolveSyncPackPath('incoming-stale-node-reading.db');

  const result = await buildDesktopSyncPack({
    outputPath: packPath, packId: 'pack-stale-node-reading-1', fromStateSeq: 0
  });

  expect(result).toMatchObject({ objectCount: 1, toStateSeq: 8 });
  expect(readPackRows(packPath)).toMatchObject({
    stateRows: [{ object_id: 'node-reading-1', object_type: 'node', state_seq: 1 }],
    syncObjects: []
  });
});

it('packs view state as a carried sync object payload', async () => {
  insertViewStateSyncState();
  const packPath = resolveSyncPackPath('incoming-view-state.db');

  const result = await buildDesktopSyncPack({ outputPath: packPath, packId: 'pack-view-state-1', fromStateSeq: 0 });

  expect(result).toMatchObject({ objectCount: 1, packId: 'pack-view-state-1', toStateSeq: 9 });
  expect(readPackRows(packPath)).toMatchObject({
    stateRows: [{
      object_id: 'session_resume:windows:desktop:desktop-test:active_node',
      object_type: 'view_state',
      state_seq: 9
    }],
    syncObjects: [expect.objectContaining({
      object_id: 'session_resume:windows:desktop:desktop-test:active_node',
      object_type: 'view_state',
      payload_json: expect.stringContaining('node-1')
    })]
  });
});
