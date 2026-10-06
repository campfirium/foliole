// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { selectFramedSyncObjectStateFact } from '../../lib/core/sync/framedSyncObjectStateFact.js';
import { upsertTextBodyBlob } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { removeExternalSearchFolder } from './externalSearchFolderRemoval.js';
import { confirmSourceManagement } from './sourceManagement.js';
import { closeLibraries, createPeer, edit, startLibraries, type Peer } from './syncEmptyLibraryTestSupport.js';

let peer: Peer;
vi.mock('./connection.js', () => ({ openDatabaseConnection: () => ({ driver: peer.driver, sqlite: peer.db }) }));
beforeEach(async () => { await startLibraries(); peer = createPeer('owner'); });
afterEach(closeLibraries);

const createdAt = '2026-07-01T00:00:00.000Z';
const deletedAt = '2026-07-24T00:23:10.000Z';

it.each(['folder', 'source', 'remote'] as const)('rolls back child retirement when %s removal fails', async (route) => {
  await seedFolder();
  const before = await readFramedSyncInventory(peer.port);
  peer.db.exec(`CREATE TRIGGER reject_folder_removal BEFORE DELETE ON external_search_folders
    BEGIN SELECT RAISE(ABORT, 'removal_rejected'); END`);
  if (route === 'folder') expect(() => removeExternalSearchFolder('folder')).toThrow('removal_rejected');
  else if (route === 'source') expect(() => confirmSourceManagement({
    action: 'remove_source', sourceRef: 'external:folder'
  })).toThrow('removal_rejected');
  else await expect(peer.port.transaction((tx) => applySyncObjectInTransaction(tx, {
    object_type: 'external_folder', object_id: 'folder', payload_json: null,
    content_hash: computeSyncContentHash('external_folder', buildCanonicalSyncTombstone('folder')),
    updated_at: deletedAt, deleted_at: deletedAt
  }))).rejects.toThrow('removal_rejected');
  expect(await readFramedSyncInventory(peer.port)).toEqual(before);
  expect(peer.db.prepare('SELECT COUNT(*) FROM external_documents').pluck().get()).toBe(1);
});

it.each(['folder', 'source', 'remote'] as const)(
  'retires child synchronization facts atomically through %s removal and preserves imported content', async (route) => {
    await seedFolder();
    edit(peer, 'Imported content remains independent');
    const before = await readFramedSyncInventory(peer.port);
    expect(before).toContainEqual(expect.objectContaining({ objectType: 'external_document', globalId: 'folder:doc.md' }));
    if (route === 'folder') removeExternalSearchFolder('folder');
    else if (route === 'source') confirmSourceManagement({ action: 'remove_source', sourceRef: 'external:folder' });
    else await peer.port.transaction((tx) => applySyncObjectInTransaction(tx, {
      object_type: 'external_folder', object_id: 'folder', payload_json: null,
      content_hash: computeSyncContentHash('external_folder', buildCanonicalSyncTombstone('folder')),
      updated_at: deletedAt, deleted_at: deletedAt
    }));
    expect(peer.db.prepare('SELECT * FROM external_documents').all()).toEqual([]);
    const state = peer.db.prepare(`SELECT content_hash, deleted_at FROM sync_object_state
      WHERE object_type = 'external_document' AND object_id = 'folder:doc.md'`).get();
    expect(state).toEqual({ content_hash: computeSyncContentHash('external_document',
      buildCanonicalSyncTombstone('folder:doc.md')), deleted_at: expect.any(String) });
    const inventory = await readFramedSyncInventory(peer.port);
    const entry = inventory.find((item) => item.globalId === 'folder:doc.md')!;
    await expect(selectFramedSyncObjectStateFact(peer.port, {
      objectType: 'external_document', globalId: entry.globalId
    }, entry.stateFactIds![0]!)).resolves.toMatchObject({ globalId: 'folder:doc.md' });
    expect(peer.db.prepare("SELECT COUNT(*) FROM nodes WHERE id = 'topic'").pluck().get()).toBe(1);
    expect(peer.db.prepare('SELECT COUNT(*) FROM content_blob_data').pluck().get()).toBeGreaterThan(0);
  }
);

async function seedFolder() {
  const folder = { id: 'folder', source_ref: 'external:folder', host_name: peer.name,
    host_platform: 'darwin', attachment_mode: 'document_relative', excluded_dirs_json: '[]' };
  await peer.port.transaction(async (tx) => {
    await applySyncObjectInTransaction(tx, { object_type: 'external_folder', object_id: 'folder',
      content_hash: computeSyncContentHash('external_folder', folder), deleted_at: null,
      payload_json: JSON.stringify(folder), updated_at: createdAt });
    const hash = hashTextBody('Original external content');
    await upsertTextBodyBlob(tx, 'Original external content', createdAt, hash);
    const document = { document_id: 'folder:doc.md', folder_id: 'folder', relative_path: 'doc.md',
      file_name: 'doc.md', extension: 'md', title: 'Document', body_blob_hash: hash,
      content_hash: hash, reference_json: null, reference_kind: 'local_path' };
    await applySyncObjectInTransaction(tx, { object_type: 'external_document', object_id: document.document_id,
      content_hash: computeSyncContentHash('external_document', document), deleted_at: null,
      payload_json: JSON.stringify(document), updated_at: createdAt });
  });
}
