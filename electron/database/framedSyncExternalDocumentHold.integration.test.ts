// @vitest-environment node
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { collectTextBodyBlobCandidates } from '../../lib/core/database/textBodyBlobCollection.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncFiles, type RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { upsertTextBodyBlob } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { closeLibraries, createPeer, root, startLibraries } from './syncLibrary.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it.each(['Original published external body', '', '\ufeff中文😀\0\r\n', '中😀'.repeat(149_796) + 'abcd'])(
  'keeps each request snapshot readable after the external folder and source body are removed (%#)', async body => {
  const peer = createPeer('external-holder');
  const hash = hashTextBody(body);
  const now = '2026-10-06T00:00:00.000Z';
  const payload = { body_blob_hash: hash, content_hash: hash, document_id: 'document',
    extension: 'md', file_name: 'original.md', folder_id: 'folder', reference_json: null,
    reference_kind: 'local_path', relative_path: 'original.md', title: 'Original' };
  await peer.port.transaction(async (tx) => {
    await upsertTextBodyBlob(tx, body, now, hash);
    await applySyncObjectInTransaction(tx, { object_type: 'external_document', object_id: 'document',
      content_hash: computeSyncContentHash('external_document', payload), deleted_at: null,
      payload_json: JSON.stringify({ ...payload, content: body }), updated_at: now });
  });
  const difference = compareFramedSyncInventories({ local: await readFramedSyncInventory(peer.port), remote: [] })
    .find((entry) => entry.objectType === 'external_document')!;
  const files = createDesktopFramedSyncFiles(path.join(root, 'requests'));
  await withRequestSyncFiles(files, async second => {
    await writeRequestSyncSnapshot(peer.port, difference, second);
    await withRequestSyncFiles(files, async first => {
      await writeRequestSyncSnapshot(peer.port, difference, first);
      await applySyncObjectInTransaction(peer.port, { object_type: 'external_folder', object_id: 'folder',
        content_hash: computeSyncContentHash('external_folder', buildCanonicalSyncTombstone('folder')),
        deleted_at: '2026-10-07', payload_json: null, updated_at: '2026-10-07' });
      expect(peer.db.prepare('SELECT * FROM external_documents').all()).toEqual([]);
      expect(collectTextBodyBlobCandidates(peer.driver, [hash]).deletedHashes).toEqual([hash]);
      await expectSnapshotBody(first, body, hash);
    });
    await expectSnapshotBody(second, body, hash);
  });
  expect(await files.list('requests')).toEqual([]);
});

async function expectSnapshotBody(request: RequestSyncFiles, body: string, hash: string) {
  const facts = [];
  for await (const fact of request.readFacts()) facts.push(fact);
  const blob = facts.flatMap(fact => fact.blobs).find(value => value.role === 5);
  if (!blob) throw new Error('expected external body');
  expect(Buffer.from(blob.sha256).toString('hex')).toBe(hash);
  expect(blob.byteLength).toBe(BigInt(Buffer.byteLength(body)));
  expect(Buffer.from(await request.loadBody(blob))).toEqual(Buffer.from(body));
}
