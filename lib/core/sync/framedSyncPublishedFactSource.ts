import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import { decodeFramedSyncManifest } from '../database/framedSyncStagingSerialization.js';

import type { DbPort } from './dbPort.js';
import { canonicalTransferId } from './framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_LIMITS, FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext } from './framedSyncContract.js';

const contextWhere = `hex(transfer_id) = ? AND group_id = ? AND sender_device_id = ?
  AND sender_library_epoch = ? AND receiver_device_id = ? AND receiver_library_epoch = ?
  AND state = 'published'`;

function bindings(context: FramedSyncContext, transferId: string) {
  if (!/^[a-f0-9]{64}$/u.test(transferId) || context.protocolVersion !== FRAMED_SYNC_PROTOCOL_VERSION) {
    throw new Error('framed_sync_transfer_id_invalid');
  }
  return [transferId.toUpperCase(), context.groupId, context.senderDeviceId, context.senderLibraryEpoch,
    context.receiverDeviceId, context.receiverLibraryEpoch];
}

async function assertIdentity(context: FramedSyncContext, transferId: string, contentId: string, manifestHash: string) {
  if (!/^[a-f0-9]{64}$/u.test(contentId) || contentId !== manifestHash ||
      bytesToHex(await canonicalTransferId(context, hexToBytes(contentId))) !== transferId) {
    throw new Error('framed_sync_publication_identity_mismatch');
  }
}

/** Only identities and blob descriptors leave SQLite; fact bodies remain in their frozen owner. */
export async function loadFramedSyncPublishedMetadata(db: DbPort, context: FramedSyncContext, transferId: string) {
  const [row] = await db.query<{ content_id: string; manifest_hash: string; metadata_json: string }>(`SELECT
    lower(hex(content_id)) AS content_id, lower(hex(manifest_hash)) AS manifest_hash,
    json_object('blobs', json_extract(manifest_json, '$.blobs'), 'facts', json((SELECT
      json_group_array(json_object('kind', json_extract(value, '$.kind'),
        'objectType', json_extract(value, '$.objectType'), 'globalId', json_extract(value, '$.globalId'),
        'factId', json_extract(value, '$.factId'), 'sharedStateHash', json_extract(value, '$.sharedStateHash'),
        'blobs', json_extract(value, '$.blobs'), 'body', json('[]')))
      FROM json_each(manifest_json, '$.facts')))) AS metadata_json
    FROM framed_sync_outbound_publications WHERE ${contextWhere} LIMIT 1`, bindings(context, transferId));
  if (!row) throw new Error('framed_sync_publication_context_missing');
  await assertIdentity(context, transferId, row.content_id, row.manifest_hash);
  const manifest = decodeFramedSyncManifest(row.metadata_json);
  if (!manifest.facts.length || manifest.facts.length > FRAMED_SYNC_LIMITS.maxFactsPerTransfer ||
      manifest.blobs.length > FRAMED_SYNC_LIMITS.maxBlobsPerTransfer) {
    throw new Error('canonical_manifest_item_limit_exceeded');
  }
  return { manifest, contentId: hexToBytes(row.content_id) };
}

/** Select one immutable fact instead of materializing the publication's entire fact array. */
export async function readFramedSyncPublishedFact(db: DbPort, context: FramedSyncContext,
  transferId: string, factIndex: number) {
  if (!Number.isSafeInteger(factIndex) || factIndex < 0 || factIndex >= FRAMED_SYNC_LIMITS.maxFactsPerTransfer) {
    throw new Error('framed_sync_fact_index_invalid');
  }
  const [row] = await db.query<{ content_id: string; manifest_hash: string; fact_json: string | null }>(`SELECT
    lower(hex(content_id)) AS content_id, lower(hex(manifest_hash)) AS manifest_hash,
    json_extract(manifest_json, ?) AS fact_json FROM framed_sync_outbound_publications
    WHERE ${contextWhere} LIMIT 1`, [`$.facts[${factIndex}]`, ...bindings(context, transferId)]);
  if (!row) throw new Error('framed_sync_publication_context_missing');
  await assertIdentity(context, transferId, row.content_id, row.manifest_hash);
  if (!row.fact_json) throw new Error('framed_sync_fact_index_invalid');
  const [fact] = decodeFramedSyncManifest(`{"blobs":[],"facts":[${row.fact_json}]}`).facts;
  if (!fact) throw new Error('framed_sync_fact_index_invalid');
  return fact;
}
