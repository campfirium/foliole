// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-builder-contract-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { ROOT_CHILD_ORDER_ID } from '../../lib/core/database/parentChildOrder.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { currentParentOrderHash } from '../../lib/core/sync/currentParentOrder.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { restoreOwnedFramedSyncNode } from '../../lib/core/sync/framedSyncNodeRecordSource.js';
import { restoreFramedSyncObjectStateFact } from '../../lib/core/sync/framedSyncObjectStateFact.js';
import { readFramedSyncObjectPayload } from '../../lib/core/sync/framedSyncObjectStatePayload.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import { upsertExternalDocuments } from './externalDocuments.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-contract-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNodeSyncState() {
  const driver = openDatabaseConnection().driver;
  const settingHash = computeSyncContentHash('setting', {
    form_factor: 'desktop', host_name: '*', key: 'app_settings', platform: 'windows',
    scope: 'user_space', value_json: '{"theme":"dark"}'
  });
  const bodyHash = upsertTextBodyBlob(driver, 'node body must stay out of pack', '2026-04-27T00:00:00.000Z');
  driver.execute(
    `INSERT INTO nodes (
       id, kind, priority, desired_retention, enable_short_term, sequential_reading_enabled,
       manual_child_order, title, is_title_manual, hide_title_heading, opening_text, content,
       body_blob_hash, virtual_filter, reveal, anchor_link, image_regions,
       import_source_fingerprint, import_content_fingerprint, current_version_id, created_at, updated_at
     ) VALUES (?, 'folder', 4, 0.92, 0, 1, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ['node-1', '["child-2","child-1"]', 'Node 1', 'Node opening preview',
      'node body must stay out of pack', bodyHash, '{"kind":"manual"}', 'Contract answer',
      '{"id":"anchor-1","kind":"highlight"}', '[{"source":"contract"}]',
      'source-contract', 'content-contract',
      '2026-04-27T00:00:00.000Z', '2026-04-27T00:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
    ) VALUES ('node', 'node-1', 1, 'node-hash', 'desktop', '2026-04-27T00:00:00.000Z', 1)`
  );
  driver.execute(
    'INSERT INTO parent_child_order (parent_id, child_ids_json, updated_at) VALUES (?, ?, ?)',
    [ROOT_CHILD_ORDER_ID, '["node-1"]', '2026-04-27T00:00:00.000Z']
  );
  driver.execute('INSERT INTO parent_order_sources VALUES (?, ?, ?, ?)',
    [ROOT_CHILD_ORDER_ID, 'contract-writer', 1, '["node-1"]']);
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('parent_child_order', ?, 5, ?, 'desktop', '2026-04-27T00:00:00.000Z', 1)`,
    [ROOT_CHILD_ORDER_ID, currentParentOrderHash(ROOT_CHILD_ORDER_ID, [
      { authorId: 'contract-writer', counter: 1, childIds: ['node-1'] }
    ])]
  );
  driver.execute(
    `INSERT INTO setting_records (
       key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at
     ) VALUES ('app_settings', 'user_space', 'windows', 'desktop', '*', '{"theme":"dark"}',
       ?, '2026-04-27T00:01:00.000Z')`, [settingHash]
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('setting', 'user_space:windows:desktop:*:app_settings', 2, ?,
       'desktop', '2026-04-27T00:01:00.000Z', 1)`, [settingHash]
  );
}

function insertExternalDocumentSyncState() {
  const folder: NativeExternalSearchFolder = {
    attachment_mode: 'document_relative',
    attachment_root_path: null,
    created_at: '2026-04-27T00:02:00.000Z',
    document_count: 0,
    excluded_dirs: [],
    folder_path: '/library',
    id: 'folder-1',
    indexed_at: null,
    last_error: null,
    status: 'ready',
    updated_at: '2026-04-27T00:02:00.000Z'
  };
  upsertExternalDocuments(folder, [{
    absolutePath: '/library/doc.md',
    content: '# External Doc\n\nOwned external body',
    extension: 'md',
    fileName: 'doc.md',
    modifiedAt: '2026-04-27T00:02:00.000Z',
    modifiedMs: 1777,
    relativePath: 'doc.md',
    sizeBytes: 48
  }], '2026-04-27T00:02:00.000Z');
}

function insertNodeAttachmentRows() {
  const driver = openDatabaseConnection().driver;
  driver.execute('UPDATE nodes SET resource_references = ? WHERE id = ?', [
    JSON.stringify([{ storage_key: `${'a'.repeat(64)}.png`, original_name: 'cover.png', role: 'image' }]), 'node-1'
  ]);
}

function insertReadwiseIdentitySyncState() {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO import_sources (
    source_fingerprint, provider, source_kind, source_name, source_locator, first_imported_at,
    last_imported_at, last_content_fingerprint, latest_node_id, source_ref, source_location,
    remote_provider, remote_connection_ref, remote_document_id, remote_annotations_json, remote_import_state_json
  ) VALUES ('source-contract','desktop_text_file','markdown','Source.md','/history/Source.md',
    '2026-04-27T00:00:00.000Z','2026-04-27T00:03:00.000Z','content-contract','node-1',
    'readwise:articles','Source.md','readwise','readwise-connection','reader-document',
    '[{"kind":"highlight","nodeId":"highlight-1","remoteId":"reader-highlight"}]',
    '{"version":1,"bodyState":"materialized"}')`);
  driver.execute(`INSERT INTO sync_object_state (
    object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
  ) VALUES ('import_source','source-contract',4,'import-source-hash','desktop',
    '2026-04-27T00:03:00.000Z',1)`);
}

async function prepareCurrentFacts() {
  insertNodeSyncState();
  insertNodeAttachmentRows();
  insertExternalDocumentSyncState();
  insertReadwiseIdentitySyncState();
  const { driver, sqlite } = openDatabaseConnection();
  flushNodeSyncVersionWithDriver(driver, 'node-1', 'desktop', '2026-04-27T00:00:00.000Z', 'ver_contract-v1');
  const port = createBetterSqliteDbPort(sqlite);
  const payload = await readFramedSyncObjectPayload(port, { objectType: 'import_source', globalId: 'source-contract' });
  driver.execute("UPDATE sync_object_state SET content_hash = ? WHERE object_type = 'import_source'", [
    computeSyncContentHash('import_source', JSON.parse(payload!))
  ]);
  return port;
}

it('preserves the original contract metadata and complete import identities through current request snapshots', async () => {
  const port = await prepareCurrentFacts();
  const differences = compareFramedSyncInventories({ local: await readFramedSyncInventory(port), remote: [] });
  const files = createDesktopFramedSyncFiles(path.join(tempRoot, 'request-contract'));
  const states: Array<{ object_type: string; payload_json: string | null }> = [];
  const nodes: NativeSyncNodeRecord[] = [];
  const externalBodies: string[] = [];
  for (const difference of differences) await withRequestSyncFiles(files, async request => {
    await writeRequestSyncSnapshot(port, difference, request);
    for await (const fact of request.readFacts()) {
      if (fact.kind === 2) nodes.push(await restoreOwnedFramedSyncNode(port, fact, (_db, blob) => request.loadBody(blob)));
      if (fact.kind === 1) {
        states.push(restoreFramedSyncObjectStateFact(fact));
        for (const blob of fact.blobs) externalBodies.push(new TextDecoder().decode(await request.loadBody(blob)));
      }
    }
  });
  expect(nodes).toEqual([expect.objectContaining({ object_id: 'node-1', parent_version_id: null,
    version_id: 'ver_contract-v1', snapshot: expect.objectContaining({
      anchor_link: '{"id":"anchor-1","kind":"highlight"}', desired_retention: 0.92,
      enable_short_term: false, id: 'node-1', image_regions: '[{"source":"contract"}]',
      import_content_fingerprint: 'content-contract', import_source_fingerprint: 'source-contract',
      manual_child_order: '["child-2","child-1"]', opening_text: 'Node opening preview', priority: 4,
      reveal: 'Contract answer', sequential_reading_enabled: true, virtual_filter: '{"kind":"manual"}',
      resource_references: JSON.stringify([{ storage_key: `${'a'.repeat(64)}.png`, original_name: 'cover.png', role: 'image' }])
    }) })]);
  expect(externalBodies).toContain('# External Doc\n\nOwned external body');
  const payloads = (type: string) => states.filter(row => row.object_type === type).map(row => JSON.parse(row.payload_json!));
  expect(payloads('external_document')).toEqual([expect.objectContaining({ document_id: 'folder-1:doc.md' })]);
  expect(payloads('parent_child_order')).toEqual([expect.objectContaining({ parent_id: ROOT_CHILD_ORDER_ID })]);
  expect(payloads('import_source')).toEqual([expect.objectContaining({
    remote_annotations_json: '[{"kind":"highlight","nodeId":"highlight-1","remoteId":"reader-highlight"}]',
    remote_import_state_json: '{"version":1,"bodyState":"materialized"}', remote_connection_ref: 'readwise-connection',
    remote_document_id: 'reader-document', remote_provider: 'readwise', source_fingerprint: 'source-contract',
    source_location: 'Source.md', source_locator: '/history/Source.md'
  })]);
});
