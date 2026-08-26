import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { openDatabaseConnection } from './connection.js';
import { buildDesktopSyncPack } from './syncPackBuilder.js';
import { insertImportSourceSyncState } from './syncPackBuilderImportSourceTestSupport.js';
import {
  insertAttachmentSyncState,
  insertExternalFolderSyncState,
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

  const result = await buildDesktopSyncPack({ fromPeerId: 'authorization-desktop', outputPath: packPath, packId: 'pack-attachment-1', fromStateSeq: 0 });

  expect(result).toMatchObject({ objectCount: 1, packId: 'pack-attachment-1', toStateSeq: 3 });
  expect(readPackRows(packPath)).toMatchObject({
    manifest: expect.objectContaining({
      tables: [
        { name: 'sync_groups', row_count: 0 },
        { name: 'sync_group_devices', row_count: 0 },
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

it('packs external folder metadata as a generic sync object', async () => {
  insertExternalFolderSyncState();
  const packPath = resolveSyncPackPath('incoming-external-folder.db');

  const result = await buildDesktopSyncPack({ fromPeerId: 'authorization-desktop', outputPath: packPath, packId: 'pack-external-folder-1', fromStateSeq: 0 });

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

  const result = await buildDesktopSyncPack({ fromPeerId: 'authorization-desktop', outputPath: packPath, packId: 'pack-import-source-1', fromStateSeq: 0 });

  expect(result).toMatchObject({ objectCount: 1, packId: 'pack-import-source-1', toStateSeq: 5 });
  expect(readPackRows(packPath)).toMatchObject({
    stateRows: [{ object_id: 'source-1', object_type: 'import_source', state_seq: 5 }],
    syncObjects: [expect.objectContaining({
      object_id: 'source-1',
      object_type: 'import_source',
      payload_json: expect.stringContaining('watched-source-1')
    })]
  });
});

it('packs pdf page text as a generic sync object', async () => {
  insertPdfPageTextSyncState();
  const packPath = resolveSyncPackPath('incoming-pdf-page-text.db');

  const result = await buildDesktopSyncPack({ fromPeerId: 'authorization-desktop', outputPath: packPath, packId: 'pack-pdf-page-text-1', fromStateSeq: 0 });

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

  const result = await buildDesktopSyncPack({ fromPeerId: 'authorization-desktop', outputPath: packPath, packId: 'pack-review-log-1', fromStateSeq: 0 });

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

  const result = await buildDesktopSyncPack({ fromPeerId: 'authorization-desktop', outputPath: packPath, packId: 'pack-node-reading-1', fromStateSeq: 0 });

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
    fromPeerId: 'authorization-desktop', outputPath: packPath, packId: 'pack-stale-node-reading-1', fromStateSeq: 0
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

  const result = await buildDesktopSyncPack({ fromPeerId: 'authorization-desktop', outputPath: packPath, packId: 'pack-view-state-1', fromStateSeq: 0 });

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
