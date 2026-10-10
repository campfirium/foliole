import { hexToBytes } from '@noble/hashes/utils.js';

import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { FRAMED_SYNC_FRAME_TYPES, FRAMED_SYNC_LIMITS } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { decodeFramedSyncDifferenceRequest, resolveFramedSyncDifferenceRequest } from '../../../../../../lib/core/sync/framedSyncDifferenceRequest.js';
import { readFramedSyncInventoryEntry } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { decodeAndValidateProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { publishFramedSyncResourceOutbound } from '../../../../../../lib/core/sync/framedSyncResourceOutbound.js';

import { context } from './companionFramedSyncOutboundSelection.js';

export function readCompanionFramedSyncOutboundRequest(payload: Record<string, unknown>) {
  const encoded = payload.difference_request_hex;
  if (typeof encoded !== 'string' || encoded.length < 2 ||
      encoded.length > FRAMED_SYNC_LIMITS.maxControlMessageBytes * 2 || (encoded.length % 2 !== 0 || !/^[a-f0-9]+$/u.test(encoded))) {
    throw new Error('framed_sync_difference_request_bytes_invalid');
  }
  return decodeFramedSyncDifferenceRequest(decodeAndValidateProtocolMessage(
    hexToBytes(encoded), FRAMED_SYNC_FRAME_TYPES.sessionControl));
}

export async function resolveCompanionFramedSyncOutboundRequest(db: DbPort, payload: Record<string, unknown>) {
  const request = readCompanionFramedSyncOutboundRequest(payload);
  const identity = request.facts[0];
  if (!identity || request.resources.length) throw new Error('framed_sync_database_request_required');
  const current = await readFramedSyncInventoryEntry(db, identity);
  if (!current) throw new Error('framed_sync_source_empty');
  const difference = resolveFramedSyncDifferenceRequest(current, request);
  return { ...payload, object_id: difference.globalId, object_type: difference.objectType,
    include_current_node: difference.need.sharedState,
    frontier_fact_ids: difference.need.frontierFactIds,
    required_relation_ids: difference.need.requiredRelationIds,
    review_fact_ids: difference.need.reviewFactIds, state_fact_ids: difference.need.stateFactIds ?? [] };
}

export async function publishCompanionFramedSyncRequestedResources(db: DbPort, payload: Record<string, unknown>) {
  const request = readCompanionFramedSyncOutboundRequest(payload);
  const files = payload.resource_files;
  if (!Array.isArray(files)) throw new Error('framed_sync_resource_files_invalid');
  const lengths = new Map<string, bigint>();
  for (const file of files) {
    if (!file || typeof file !== 'object' || !('storage_key' in file) || !('byte_length' in file) ||
        typeof file.storage_key !== 'string' || typeof file.byte_length !== 'string' ||
        file.byte_length.length > String(FRAMED_SYNC_LIMITS.maxBlobBytes).length ||
        !/^(?:0|[1-9][0-9]*)$/u.test(file.byte_length) || lengths.has(file.storage_key)) {
      throw new Error('framed_sync_resource_files_invalid');
    }
    const length = BigInt(file.byte_length);
    if (length > BigInt(FRAMED_SYNC_LIMITS.maxBlobBytes)) throw new Error('blob_size_limit_exceeded');
    lengths.set(file.storage_key, length);
  }
  const required = new Set(request.resources.map((resource) => resource.storageKey));
  if (required.size !== lengths.size || [...required].some((key) => !lengths.has(key))) {
    throw new Error('framed_sync_outbound_resource_unavailable');
  }
  return publishFramedSyncResourceOutbound({ context: context(payload), db,
    sources: request.resources.map((demand) => ({ demand, byteLength: lengths.get(demand.storageKey)! })) });
}
