import { bytes, list, row, text } from './framedSyncDecodedValues.js';
import type {
  FramedSyncInventoryDifference,
  FramedSyncInventoryEntry
} from './framedSyncInventory.js';
import {
  encodeValidatedProtocolMessage,
  type ValidatedProtocolMessage
} from './framedSyncProtocolCodec.js';

export type FramedSyncRequestedFact = Readonly<{
  factId: string;
  globalId: string;
  kind: 2 | 3 | 4;
  objectType: 'node';
}>;

function identity(globalId: string, factId: string, kind: FramedSyncRequestedFact['kind']) {
  return { factId, globalId, kind, objectType: 'node' as const };
}

export function projectFramedSyncDifferenceRequest(input: {
  difference: FramedSyncInventoryDifference;
  roundId: Uint8Array;
}) {
  const { difference } = input;
  if (difference.direction !== 'remote_to_local' || difference.objectType !== 'node') {
    throw new Error('framed_sync_difference_request_direction_invalid');
  }
  const versionIds = new Set(difference.sourceSnapshot.frontierFactIds);
  const facts = [
    ...[...versionIds].map((id) => identity(difference.globalId, id, 2)),
    ...difference.sourceSnapshot.requiredRelationIds.map((id) => identity(difference.globalId, id, 3)),
    ...difference.sourceSnapshot.reviewFactIds.map((id) => identity(difference.globalId, id, 4))
  ];
  const payload = {
    blobHashes: difference.sourceSnapshot.resourceHashes,
    facts,
    roundId: input.roundId
  };
  return {
    encoded: encodeValidatedProtocolMessage('difference_request', payload),
    payload
  };
}

export function decodeFramedSyncDifferenceRequest(message: ValidatedProtocolMessage) {
  if (message.payloadCase !== 'difference_request') {
    throw new Error('framed_sync_difference_request_required');
  }
  const payload = row(message.payload);
  const facts = list(payload.facts).map((value): FramedSyncRequestedFact => {
    const fact = row(value);
    const kind = Number(fact.kind);
    if (kind !== 2 && kind !== 3 && kind !== 4) {
      throw new Error('framed_sync_difference_request_fact_kind_invalid');
    }
    const objectType = text(fact.objectType, 'object_type');
    if (objectType !== 'node') throw new Error('framed_sync_difference_request_object_type_invalid');
    return {
      factId: text(fact.factId, 'fact_id'),
      globalId: text(fact.globalId, 'global_id'),
      kind,
      objectType
    };
  });
  return {
    blobHashes: list(payload.blobHashes).map((value) => bytes(value, 'blob_hash').slice()),
    facts,
    roundId: bytes(payload.roundId, 'round_id').slice()
  };
}

export function resolveFramedSyncDifferenceRequest(
  current: FramedSyncInventoryEntry,
  request: ReturnType<typeof decodeFramedSyncDifferenceRequest>
): FramedSyncInventoryDifference {
  if (current.objectType !== 'node' || request.facts.some((fact) =>
    fact.objectType !== current.objectType || fact.globalId !== current.globalId)) {
    throw new Error('framed_sync_difference_request_identity_mismatch');
  }
  const ids = (kind: FramedSyncRequestedFact['kind']) =>
    request.facts.filter((fact) => fact.kind === kind).map((fact) => fact.factId);
  const frontierFactIds = ids(2);
  const requiredRelationIds = ids(3);
  const reviewFactIds = ids(4);
  assertSame(frontierFactIds, current.frontierFactIds);
  assertSame(requiredRelationIds, current.requiredRelationIds);
  assertSame(reviewFactIds, current.reviewFactIds);
  assertSame(request.blobHashes.map(hex), current.resourceHashes.map(hex));
  return {
    direction: 'local_to_remote',
    globalId: current.globalId,
    need: {
      frontierFactIds,
      requiredRelationIds,
      resourceHashes: request.blobHashes,
      reviewFactIds,
      sharedState: frontierFactIds.length > 0
    },
    objectType: current.objectType,
    sourceSnapshot: current
  };
}

function assertSame(requested: readonly string[], current: readonly string[]) {
  const values = new Set(current);
  if (requested.length !== current.length || requested.some((value) => !values.has(value))) {
    throw new Error('framed_sync_difference_request_source_changed');
  }
}

const hex = (value: Uint8Array) => [...value]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');
