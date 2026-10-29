import { TEXT_BODY_MAX_BYTES } from '../nodes/textBodyBudget.js';

import { dailyFlowTableBeginSchema, dailyFlowTableBatchSchema, dailyFlowTableEndSchema } from './dailyFlowTableContract.js';
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
  factIdentity,
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
import { FRAMED_SYNC_FACT_FRAGMENT_BYTES, FRAMED_SYNC_MAX_ENCODED_FACT_BYTES } from './framedSyncFactFragmentContract.js';
import type { ProtocolPayloadCase } from './framedSyncReceiver.js';
import { readFramedSyncRequestedResources } from './framedSyncResourceRequest.js';
import { attachmentRequestSchema } from './requestSyncAttachmentContract.js';

export function assertDecodedProtocolPayload(payloadCase: ProtocolPayloadCase, value: unknown) {
  walk(value, 0, { fields: 0 });
  const payload = row(value);
  if (validateRequestPayload(payloadCase, payload)) return;
  if (payloadCase === 'fact') factRecord(payload);
  else if (payloadCase === 'fact_fragment') {
    factIdentity(payload.identity);
    digest(payload.sharedStateHash, 'shared_state_hash');
    digest(payload.encodedSha256, 'encoded_sha256');
    const total = unsigned(payload.totalByteLength, 'fact_total_byte_length');
    const offset = unsigned(payload.offset, 'fact_offset');
    const data = bytes(payload.data, 'fact_fragment_data');
    if (total <= BigInt(FRAMED_SYNC_LIMITS.maxDecompressedFrameBytes) ||
        total > BigInt(FRAMED_SYNC_MAX_ENCODED_FACT_BYTES) || !data.byteLength ||
        data.byteLength > FRAMED_SYNC_FACT_FRAGMENT_BYTES || offset + BigInt(data.byteLength) > total) {
      throw new Error('fact_fragment_range_invalid');
    }
  }
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
    if (!list(payload.resources).length) { text(payload.objectType, 'object_type'); text(payload.globalId, 'global_id'); }
    const sourceHash = bytes(payload.sourceStateHash ?? new Uint8Array(), 'source_state_hash');
    if (sourceHash.byteLength) assertFramedSyncDigest(sourceHash, 'source_state_hash');
    const hashes = list(payload.blobHashes, FRAMED_SYNC_LIMITS.maxBlobsPerTransfer)
      .map((hash) => hex(digest(hash, 'blob_hash')));
    unique(hashes, 'blob_hash');
    const resources = readFramedSyncRequestedResources(payload.resources);
    if (resources.length && (hashes.length || list(payload.facts).length)) {
      throw new Error('framed_sync_resource_request_mixed');
    }
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

function validateRequestPayload(payloadCase: ProtocolPayloadCase, payload: Record<string, unknown>) {
  if (payloadCase === 'daily_flow_table_begin') { dailyFlowTableBeginSchema.parse(payload); return true; }
  if (payloadCase === 'daily_flow_table_batch') { dailyFlowTableBatchSchema.parse(payload); return true; }
  if (payloadCase === 'daily_flow_table_end') { dailyFlowTableEndSchema.parse(payload); return true; }
  if (payloadCase === 'request_attachment') { attachmentRequestSchema.parse(payload); return true; }
  if (payloadCase === 'request_batch_end') {
    fixedBytes(payload.requestId, 16, 'request_id');
    if (unsigned(payload.objectCount, 'object_count') > 0xffff_ffffn) {
      throw new Error('request_sync_batch_count_invalid');
    }
    return true;
  }
  if (!payloadCase.startsWith('request_object_')) return false;
  fixedBytes(payload.requestId, 16, 'request_id');
  if (payloadCase === 'request_object_result') {
    text(payload.objectType, 'object_type'); text(payload.globalId, 'global_id');
    if (payload.error !== '') text(payload.error, 'error');
  } else if (payloadCase === 'request_object_header') {
    text(payload.objectType, 'object_type'); text(payload.globalId, 'global_id');
    digest(payload.sourceStateHash, 'source_state_hash');
  } else {
    digest(payload.streamHash, 'stream_hash');
    unsigned(payload.factCount, 'fact_count'); unsigned(payload.bodyCount, 'body_count');
  }
  return true;
}

function validateRemainingPayload(payloadCase: ProtocolPayloadCase, payload: Record<string, unknown>) {
  if (payloadCase === 'inventory_begin') {
    fixedBytes(payload.roundId, 16, 'round_id');
    validateInventoryBuckets(payload);
    unique(list(payload.detailGlobalIds ?? [], FRAMED_SYNC_LIMITS.maxInventoryEntries)
      .map(id => text(id, 'detail_global_id')), 'detail_global_id');
    if (unsigned(payload.entryCount, 'entry_count') > BigInt(FRAMED_SYNC_LIMITS.maxInventoryEntries)) {
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
    if (data.byteLength > TEXT_BODY_MAX_BYTES ||
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
  const entries = list(value, FRAMED_SYNC_LIMITS.maxInventoryEntriesPerFrame);
  unique(entries.map((item) => {
    const entry = row(item); text(entry.objectType, 'object_type'); text(entry.globalId, 'global_id');
    digest(entry.sharedStateHash, 'shared_state_hash');
    for (const key of [
      'frontierFactIds', 'requiredRelationIds', 'reviewFactIds', 'stateFactIds', 'versionStates'
    ]) {
      unique(list(entry[key] ?? [], FRAMED_SYNC_LIMITS.maxInventoryFactIdsPerEntry)
        .map((id) => text(id, key)), key);
    }
    unique(list(entry.resourceHashes, FRAMED_SYNC_LIMITS.maxBlobsPerTransfer)
      .map((hash) => hex(digest(hash, 'resource_hash'))), 'resource_hash');
    return `${entry.objectType}\0${entry.globalId}`;
  }), 'inventory_entry');
}

function validateInventoryBuckets(payload: Record<string, unknown>) {
  const hashes = payload.bucketHashes === undefined ? new Uint8Array() : bytes(payload.bucketHashes, 'bucket_hashes');
  if (hashes.length && hashes.length !== 1024 * 32) {
    throw new Error('inventory_bucket_summary_invalid');
  }
  const selected = list(payload.selectedBuckets ?? []);
  const details = list(payload.detailGlobalIds ?? []);
  if ((payload.bucketSummary === true && (selected.length || details.length)) ||
      (selected.length && details.length) || (hashes.length && payload.bucketSummary !== true)) {
    throw new Error('inventory_bucket_selection_invalid');
  }
  for (const field of ['unreadyBuckets', 'selectedBuckets']) {
    const values = list(payload[field] ?? [], 1024).map(value => unsigned(value, field));
    if (values.some((value, index) => value >= 1024n || (index > 0 && value <= values[index - 1]!))) {
      throw new Error('inventory_bucket_selection_invalid');
    }
  }
}
