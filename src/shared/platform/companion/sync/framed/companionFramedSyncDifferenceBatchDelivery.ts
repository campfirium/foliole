import { FRAMED_SYNC_BATCH_LIMITS } from '../../../../../../lib/core/sync/framedSyncBatchLimits.js';
import { FRAMED_SYNC_LIMITS } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { revalidateFramedSyncInventorySource, type FramedSyncInventoryDifference } from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncMissingDependency } from '../../../../../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import type { NativeCompanionFramedSyncInventoryRequest, NativeCompanionFramedSyncTransferBatchRequest,
  NativeCompanionFramedSyncTransferReceipt } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';

import { readCompanionFramedSyncInventoryEntry } from './companionFramedSyncInventory.js';
import { decodeCompanionInventoryEntry } from './companionFramedSyncInventoryEntryDecode.js';
import { sendCompanionFramedSyncObject } from './companionFramedSyncTransfer.js';
import { sendCompanionFramedSyncObjects } from './companionFramedSyncTransferBatch.js';

type Selected = NativeCompanionFramedSyncTransferBatchRequest['transfers'][number];
type Sent = { objectId: string; receipt: NativeCompanionFramedSyncTransferReceipt };

/** Selection metadata is bounded here; native preparation owns immutable bodies and byte packing. */
export function createCompanionFramedSyncDifferenceBatchDelivery(args: NativeCompanionFramedSyncInventoryRequest,
  differences: readonly FramedSyncInventoryDifference[], sent: Sent[]) {
  const completed = new Set<FramedSyncInventoryDifference>();
  const indexes = new Map(differences.map((difference, index) => [difference, index]));
  return async (difference: FramedSyncInventoryDifference): Promise<'delivered' | 'deferred'> => {
    if (completed.has(difference)) return 'delivered';
    const index = indexes.get(difference);
    const candidates = index === undefined ? [difference] : differences.slice(index, index + FRAMED_SYNC_BATCH_LIMITS.maxItems);
    const selected: Array<{ difference: FramedSyncInventoryDifference; input: Selected }> = [];
    let bytes = new TextEncoder().encode(JSON.stringify(args)).byteLength;
    for (const candidate of candidates) {
      if (candidate.direction !== 'local_to_remote') break;
      if (completed.has(candidate)) continue;
      const input = await selectCurrent(candidate);
      if (!input) continue;
      const size = selectionBytes(input);
      if (size + bytes > FRAMED_SYNC_LIMITS.maxControlMessageBytes) {
        if (!selected.length) throw new Error('framed_sync_batch_selection_limit_exceeded');
        break;
      }
      selected.push({ difference: candidate, input });
      bytes += size;
    }
    if (!selected.length) return 'deferred';
    const outcomes = selected.length === 1
      ? [await sendSingleOutcome(args, selected[0]!.input)]
      : await sendCompanionFramedSyncObjects({ ...args, transfers: selected.map(item => item.input) });
    let currentError: string | undefined;
    for (const [offset, outcome] of outcomes.entries()) {
      const item = selected[offset]!;
      if (outcome.kind === 'committed') {
        completed.add(item.difference);
        sent.push({ objectId: item.difference.globalId, receipt: outcome.receipt });
      } else if (item.difference === difference) currentError = outcome.error;
    }
    if (currentError) throw new Error(currentError);
    return completed.has(difference) ? 'delivered' : 'deferred';
  };
}

async function selectCurrent(difference: FramedSyncInventoryDifference): Promise<Selected | null> {
  const value = await getIosCompanionDatabaseOwner().read(db => readCompanionFramedSyncInventoryEntry(db, difference));
  const current = value ? decodeCompanionInventoryEntry(value) : null;
  const validated = revalidateFramedSyncInventorySource({ currentSource: current ? [current] : [],
    differences: [difference], direction: 'local_to_remote' });
  if (validated.deferredObjects.length || (difference.objectType === 'node' && current && !current.resourceHashes.length &&
      (difference.need.sharedState || difference.need.frontierFactIds.length || difference.need.requiredRelationIds.length))) return null;
  return { include_current_node: difference.need.sharedState || !!difference.need.frontierFactIds.length || !!difference.need.resourceHashes.length,
    frontier_fact_ids: difference.need.frontierFactIds,
    object_id: difference.globalId, object_type: difference.objectType, required_relation_ids: difference.need.requiredRelationIds,
    review_fact_ids: difference.need.reviewFactIds, state_fact_ids: difference.need.stateFactIds ?? [] };
}

async function sendSingleOutcome(args: NativeCompanionFramedSyncInventoryRequest, input: Selected) {
  try {
    return { kind: 'committed' as const, object_id: input.object_id, object_type: input.object_type,
      receipt: await sendIndividual(args, input) };
  } catch (error) {
    if (!readFramedSyncMissingDependency(error)) throw error;
    return { kind: 'deferred' as const, object_id: input.object_id, object_type: input.object_type,
      error: error instanceof Error ? error.message : String(error) };
  }
}

function sendIndividual(args: NativeCompanionFramedSyncInventoryRequest, input: Selected) {
  return sendCompanionFramedSyncObject({ endpointUrl: args.endpoint_url, groupId: args.sync_group_id,
    ...(input.frontier_fact_ids ? { frontierFactIds: input.frontier_fact_ids } : {}),
    includeCurrentNode: input.include_current_node, objectId: input.object_id, objectType: input.object_type,
    receiverDeviceId: args.receiver_device_id, receiverLibraryEpoch: args.receiver_library_epoch,
    requiredRelationIds: input.required_relation_ids, reviewFactIds: input.review_fact_ids, stateFactIds: input.state_fact_ids });
}

function selectionBytes(input: Selected) {
  let bytes = 256;
  const groups = [[input.object_id, input.object_type], input.transfer_id ? [input.transfer_id] : [],
    input.required_relation_ids, input.review_fact_ids, input.state_fact_ids];
  for (const group of groups) for (const value of group) {
    bytes += new TextEncoder().encode(JSON.stringify(value)).byteLength + 1;
    if (bytes > FRAMED_SYNC_LIMITS.maxControlMessageBytes) return bytes;
  }
  return bytes;
}
