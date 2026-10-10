// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { collectTextBodyBlobCandidates } from '../../lib/core/database/textBodyBlobCollection.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory, readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { readFramedSyncPublishedBody } from '../../lib/core/sync/framedSyncPublishedBody.js';
import { loadFramedSyncPublishedOutboundValue } from '../../lib/core/sync/framedSyncPublishedOutboundValue.js';
import { upsertTextBodyBlob } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { publishDesktopFramedSyncNodeOutbound } from './desktopFramedSyncOutboundSelection.js';
import { createDesktopFramedSyncStaging } from './desktopFramedSyncStaging.js';
import { closeLibraries, createPeer, startLibraries } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('protects retired external document text independently for each unfinished receiver', async () => {
  const peer = createPeer('external-holder');
  const body = 'Original published external body';
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
  const publications = [];
  for (const member of ['receiver-b', 'receiver-c']) {
    const result = await publishDesktopFramedSyncNodeOutbound({ port: peer.port, difference,
      readCurrentInventoryEntry: readFramedSyncInventoryEntry, context: {
        groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, senderDeviceId: 'sender',
        senderLibraryEpoch: 'sender-epoch', receiverDeviceId: member, receiverLibraryEpoch: `${member}-epoch`
      } });
    if (result.kind !== 'published') throw new Error('expected_publication');
    publications.push(result.publication);
  }
  await applySyncObjectInTransaction(peer.port, { object_type: 'external_folder', object_id: 'folder',
    content_hash: computeSyncContentHash('external_folder', buildCanonicalSyncTombstone('folder')),
    deleted_at: '2026-10-07', payload_json: null, updated_at: '2026-10-07' });
  expect(peer.db.prepare('SELECT * FROM external_documents').all()).toEqual([]);
  expect(collectTextBodyBlobCandidates(peer.driver, [hash]).deletedHashes).toEqual([]);
  const staging = createDesktopFramedSyncStaging(peer.port);
  const first = publications[0]!;
  await staging.commitOutboundReceipt({ transferId: first.transferId, contentId: first.contentId,
    appliedStateHash: difference.sourceSnapshot.sharedStateHash,
    receiverDeviceId: first.context.receiverDeviceId, receiverLibraryEpoch: first.context.receiverLibraryEpoch });
  await staging.releaseOutboundHolds(first.transferId);
  expect(collectTextBodyBlobCandidates(peer.driver, [hash]).deletedHashes).toEqual([]);
  const remaining = publications[1]!;
  const frozen = await loadFramedSyncPublishedOutboundValue(peer.port, remaining.context,
    Buffer.from(remaining.transferId).toString('hex'));
  const blob = frozen.blobs.find((value) => value.role === 5 && value.sha256 === hash)!;
  expect(blob).toBeDefined();
  const bytes = await readFramedSyncPublishedBody(peer.port, remaining.context, {
    transferId: frozen.transfer_id, hash, byteLength: Number(blob.byte_length) });
  expect(new TextDecoder().decode(bytes)).toBe(body);
  await staging.persistTerminationRequest({ authorDeviceId: 'sender', memberId: remaining.context.receiverDeviceId,
    transferId: remaining.transferId });
  await staging.acknowledgeTermination(remaining.transferId, remaining.context.receiverDeviceId);
  expect(collectTextBodyBlobCandidates(peer.driver, [hash]).deletedHashes).toEqual([hash]);
});
