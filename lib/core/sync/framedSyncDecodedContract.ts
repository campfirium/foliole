import {
  assertAttemptId,
  assertFramedSyncDigest,
  assertSessionId,
  FRAMED_SYNC_LIMITS,
  FRAMED_SYNC_PROTOCOL_VERSION
} from './framedSyncContract.js';
import {
  blobReference,
  bytes,
  capabilities,
  digest,
  enumValue,
  factRecord,
  fixedBytes,
  hex,
  list,
  row,
  text,
  transferManifest,
  unique,
  unsigned,
  validateIdentityList,
  walk
} from './framedSyncDecodedValues.js';
import type { ProtocolPayloadCase } from './framedSyncReceiver.js';

export function assertDecodedProtocolPayload(payloadCase: ProtocolPayloadCase, value: unknown) {
  walk(value, 0, { fields: 0 });
  const payload = row(value);
  if (payloadCase === 'fact') factRecord(payload);
  else if (payloadCase === 'transfer_header') {
    digest(payload.transferId, 'transfer_id'); assertAttemptId(bytes(payload.attemptId, 'attempt_id'));
    transferManifest(payload.manifest);
  } else if (payloadCase === 'handshake' || payloadCase === 'handshake_acceptance') {
    if (payload.protocolVersion !== FRAMED_SYNC_PROTOCOL_VERSION) throw new Error('protocol_version_invalid');
    assertSessionId(bytes(payload.sessionId, 'session_id')); capabilities(payload.capabilities);
    if (payloadCase === 'handshake') {
      text(payload.groupId, 'group_id'); text(payload.deviceId, 'device_id');
      text(payload.libraryEpoch, 'library_epoch');
    }
  } else if (payloadCase === 'difference_request') {
    fixedBytes(payload.roundId, 16, 'round_id');
    validateIdentityList(payload.facts);
    const hashes = list(payload.blobHashes, FRAMED_SYNC_LIMITS.maxBlobsPerTransfer)
      .map((hash) => hex(digest(hash, 'blob_hash')));
    unique(hashes, 'blob_hash');
  } else if (payloadCase === 'blob_offer') {
    digest(payload.transferId, 'transfer_id');
    unique(list(payload.blobs, FRAMED_SYNC_LIMITS.maxBlobsPerTransfer).map(blobReference), 'blob_offer');
  } else if (payloadCase === 'missing_blob_set') {
    digest(payload.transferId, 'transfer_id');
    const hashes = list(payload.missingHashes, FRAMED_SYNC_LIMITS.maxBlobsPerTransfer)
      .map((hash) => hex(digest(hash, 'blob_hash')));
    unique(hashes, 'missing_blob_hash');
  } else validateRemainingPayload(payloadCase, payload);
}

function validateRemainingPayload(payloadCase: ProtocolPayloadCase, payload: Record<string, unknown>) {
  if (payloadCase === 'inventory_begin') {
    fixedBytes(payload.roundId, 16, 'round_id');
    if (unsigned(payload.entryCount, 'entry_count') > BigInt(FRAMED_SYNC_LIMITS.maxFactsPerTransfer)) {
      throw new Error('inventory_entry_limit_exceeded');
    }
  } else if (payloadCase === 'inventory_chunk') {
    fixedBytes(payload.roundId, 16, 'round_id');
    validateInventoryEntries(payload.entries);
  } else if (payloadCase === 'inventory_end') {
    fixedBytes(payload.roundId, 16, 'round_id'); digest(payload.inventoryHash, 'inventory_hash');
  } else if (payloadCase === 'transfer_proposal') {
    digest(payload.transferId, 'transfer_id'); digest(payload.contentId, 'content_id');
    for (const key of ['senderDeviceId', 'senderLibraryEpoch', 'receiverDeviceId', 'receiverLibraryEpoch']) {
      text(payload[key], key);
    }
    if (unsigned(payload.factCount, 'fact_count') > BigInt(FRAMED_SYNC_LIMITS.maxFactsPerTransfer) ||
        unsigned(payload.blobCount, 'blob_count') > BigInt(FRAMED_SYNC_LIMITS.maxBlobsPerTransfer) ||
        unsigned(payload.totalBlobBytes, 'total_blob_bytes') > BigInt(FRAMED_SYNC_LIMITS.maxTransferBytes)) {
      throw new Error('transfer_proposal_limit_exceeded');
    }
  } else if (payloadCase === 'blob_chunk') {
    digest(payload.transferId, 'transfer_id'); digest(payload.blobHash, 'blob_hash');
    const data = bytes(payload.data, 'blob_data');
    if (data.byteLength > FRAMED_SYNC_LIMITS.blobChunkBytes ||
        unsigned(payload.offset, 'blob_offset') + BigInt(data.byteLength) > BigInt(FRAMED_SYNC_LIMITS.maxBlobBytes)) {
      throw new Error('blob_chunk_range_invalid');
    }
  } else if (payloadCase === 'transfer_trailer') {
    digest(payload.transferId, 'transfer_id'); digest(payload.manifestHash, 'manifest_hash');
    if (unsigned(payload.factCount, 'fact_count') > BigInt(FRAMED_SYNC_LIMITS.maxFactsPerTransfer) ||
        unsigned(payload.blobCount, 'blob_count') > BigInt(FRAMED_SYNC_LIMITS.maxBlobsPerTransfer)) {
      throw new Error('transfer_trailer_limit_exceeded');
    }
  } else if (payloadCase === 'transfer_receipt') {
    digest(payload.transferId, 'transfer_id'); digest(payload.contentId, 'content_id');
    digest(payload.appliedStateHash, 'applied_state_hash');
    text(payload.receiverDeviceId, 'receiver_device_id'); text(payload.receiverLibraryEpoch, 'receiver_library_epoch');
  } else if (payloadCase === 'round_receipt') {
    fixedBytes(payload.roundId, 16, 'round_id'); enumValue(payload.result, 2, 'round_result');
    validateIdentityList(payload.deferredFacts);
  } else if (payloadCase === 'transfer_termination') {
    digest(payload.transferId, 'transfer_id'); text(payload.memberId, 'member_id');
  } else if (payloadCase === 'error') {
    enumValue(payload.code, 8, 'error_code'); text(payload.message, 'error_message');
    const transferId = bytes(payload.transferId, 'transfer_id');
    if (transferId.byteLength !== 0) assertFramedSyncDigest(transferId, 'transfer_id');
  }
}

function validateInventoryEntries(value: unknown) {
  const entries = list(value, FRAMED_SYNC_LIMITS.maxFactsPerTransfer);
  unique(entries.map((item) => {
    const entry = row(item); text(entry.objectType, 'object_type'); text(entry.globalId, 'global_id');
    digest(entry.sharedStateHash, 'shared_state_hash');
    for (const key of [
      'frontierFactIds', 'requiredRelationIds', 'reviewFactIds', 'stateFactIds'
    ]) {
      unique(list(entry[key], FRAMED_SYNC_LIMITS.maxFactsPerTransfer)
        .map((id) => text(id, key)), key);
    }
    unique(list(entry.resourceHashes, FRAMED_SYNC_LIMITS.maxBlobsPerTransfer)
      .map((hash) => hex(digest(hash, 'resource_hash'))), 'resource_hash');
    return `${entry.objectType}\0${entry.globalId}`;
  }), 'inventory_entry');
}
