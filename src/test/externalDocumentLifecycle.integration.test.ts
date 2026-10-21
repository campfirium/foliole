// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { retireExternalDocument } from '../../lib/core/database/externalDocumentRetirement.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { createCompanionRequestFixture } from './companionRequestSync.testSupport.js';

const ids = ['local-folder:original.md', 'readwise-reader-import-articles:Article.md', 'readwise-api:remote'];

it('keeps independent external documents current across two desktops and the mobile HTTP client, including offline deletions', { meta: { calibratedMs: 60_000 } }, async () => {
  const mobile = await createCompanionRequestFixture();
  const desktop = mobile.fixture.rightSnapshot;
  const third = await mobile.fixture.startThird();
  const source = new Database(desktop.databasePath);
  const peer = new Database(third.snapshot.databasePath);
  const pullThird = () => third.process.invoke('round', { input: { kind: 'request_reconcile', peerOrigin: desktop.origin,
    peer: { deviceId: desktop.deviceId, libraryEpoch: `${desktop.deviceId}-epoch` } } });
  try {
    for (const id of ids) await writeDocument(source, id, 'Original body', '2026-10-16T01:00:00Z');
    expect(await pullThird()).toEqual({ complete: true, attachmentProgress: 0, attachmentYielded: false });
    await mobile.sync();
    for (const db of [source, peer, mobile.sqlite]) await assertDocuments(db, ids, 'Original body');
    for (const id of ids) await writeDocument(source, id, 'Updated whole body', '2026-10-16T02:00:00Z');
    await mobile.sync();
    expect(await pullThird()).toEqual({ complete: true, attachmentProgress: 0, attachmentYielded: false });
    for (const db of [source, peer, mobile.sqlite]) await assertDocuments(db, ids, 'Updated whole body');
    retire(source, ids[0]!);
    const renamed = 'local-folder:renamed.md';
    await writeDocument(source, renamed, 'Updated whole body', '2026-10-16T03:00:00Z');
    await mobile.sync();
    assertDeleted(mobile.sqlite, ids[0]!);
    await assertDocuments(mobile.sqlite, [renamed, ...ids.slice(1)], 'Updated whole body');
    // The third peer still owns live copies while both Readwise source kinds are cleared.
    for (const id of ids.slice(1)) retire(source, id);
    await mobile.sync();
    for (const id of ids) assertDeleted(mobile.sqlite, id);
    expect(await pullThird()).toEqual({ complete: true, attachmentProgress: 0, attachmentYielded: false });
    await mobile.sync();
    for (const db of [source, peer, mobile.sqlite]) {
      for (const id of ids) assertDeleted(db, id);
      await assertDocuments(db, [renamed], 'Updated whole body');
      expect(db.prepare('SELECT document_id FROM external_documents WHERE is_present = 1').all())
        .toEqual([{ document_id: renamed }]);
    }
    await mobile.restart();
    await mobile.sync();
    for (const id of ids) assertDeleted(mobile.sqlite, id);
  } finally { source.close(); peer.close(); await third.process.close(); await mobile.close(); }
});

function retire(sqlite: Database.Database, documentId: string) {
  expect(retireExternalDocument(createBetterSqlite3Driver(sqlite), {
    documentId, deletedAt: '2026-10-16T04:00:00Z', hostName: 'source-host'
  })).toBe(true);
}

async function writeDocument(sqlite: Database.Database, documentId: string, content: string, updatedAt: string) {
  const bodyHash = hashTextBody(content);
  const payload = { document_id: documentId, body_blob_hash: bodyHash, content_hash: bodyHash,
    extension: 'md', file_name: documentId, folder_id: 'virtual-source', relative_path: documentId,
    reference_kind: documentId.startsWith('readwise-api:') ? 'readwise_remote' : 'local_path',
    reference_json: null, title: 'Independent document' };
  await applySyncObjectInTransaction(createBetterSqliteDbPort(sqlite), {
    object_type: 'external_document', object_id: documentId, content_hash: computeSyncContentHash('external_document', payload),
    deleted_at: null, updated_at: updatedAt, payload_json: JSON.stringify({ ...payload, content })
  });
}

async function assertDocuments(sqlite: Database.Database, documentIds: string[], body: string) {
  const entries = await readFramedSyncInventory(createBetterSqliteDbPort(sqlite));
  for (const id of documentIds) {
    expect(sqlite.prepare('SELECT content, body_blob_hash, is_present FROM external_documents WHERE document_id = ?').get(id))
      .toEqual({ content: body, body_blob_hash: hashTextBody(body), is_present: 1 });
    expect(entries.filter(entry => entry.objectType === 'external_document' && entry.globalId === id)).toHaveLength(1);
    expect(sqlite.prepare('SELECT id FROM nodes WHERE id = ?').get(id)).toBeUndefined();
  }
  expect(sqlite.prepare('SELECT id FROM external_search_folders').all()).toEqual([]);
}

function assertDeleted(sqlite: Database.Database, documentId: string) {
  const row = sqlite.prepare('SELECT is_present FROM external_documents WHERE document_id = ?').pluck().get(documentId);
  expect(row ?? 0).toBe(0);
  expect(sqlite.prepare("SELECT content_hash, deleted_at FROM sync_object_state WHERE object_type = 'external_document' AND object_id = ?")
    .get(documentId)).toEqual({ deleted_at: '2026-10-16T04:00:00Z',
    content_hash: computeSyncContentHash('external_document', buildCanonicalSyncTombstone(documentId)) });
}
