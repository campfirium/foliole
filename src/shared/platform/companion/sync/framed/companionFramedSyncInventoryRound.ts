import { hexToBytes } from '@noble/hashes/utils.js';

import {
  compareFramedSyncInventories,
  revalidateFramedSyncInventorySource,
  type FramedSyncDeferredObject,
  type FramedSyncInventoryDifference,
  type FramedSyncInventoryEntry
} from '../../../../../../lib/core/sync/framedSyncInventory.js';
import type {
  NativeCompanionFramedSyncInventoryEntry,
  NativeCompanionFramedSyncInventoryRequest,
  NativeCompanionFramedSyncInventoryResult,
  NativeCompanionFramedSyncTransferReceipt
} from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';

import {
  readCompanionFramedSyncInventory,
  readCompanionFramedSyncInventoryEntry
} from './companionFramedSyncInventory.js';
import { sendCompanionFramedSyncObject } from './companionFramedSyncTransfer.js';

const HEX_DIGEST = /^[a-f0-9]{64}$/u;

function strings(value: unknown, name: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
    throw new Error(`framed_sync_inventory_${name}_invalid`);
  }
  return value as string[];
}

function digest(value: unknown, name: string) {
  if (typeof value !== 'string' || !HEX_DIGEST.test(value)) {
    throw new Error(`framed_sync_inventory_${name}_invalid`);
  }
  return hexToBytes(value);
}

function decodeEntry(value: NativeCompanionFramedSyncInventoryEntry): FramedSyncInventoryEntry {
  if (!value || typeof value !== 'object' || !value.object_type || !value.global_id) {
    throw new Error('framed_sync_inventory_identity_invalid');
  }
  return {
    frontierFactIds: strings(value.frontier_fact_ids, 'frontier_fact_ids'),
    globalId: value.global_id,
    objectType: value.object_type,
    requiredRelationIds: strings(value.required_relation_ids, 'required_relation_ids'),
    resourceHashes: strings(value.resource_hashes, 'resource_hashes')
      .map((hash) => digest(hash, 'resource_hash')),
    reviewFactIds: strings(value.review_fact_ids, 'review_fact_ids'),
    sharedStateHash: digest(value.shared_state_hash, 'shared_state_hash')
  };
}

function decodeOptionalEntry(value: NativeCompanionFramedSyncInventoryEntry | null) {
  return value ? decodeEntry(value) : null;
}

export function decodeCompanionFramedSyncInventory(
  value: NativeCompanionFramedSyncInventoryResult
) {
  if (!value || !Array.isArray(value.entries)) throw new Error('framed_sync_inventory_result_invalid');
  return value.entries.map(decodeEntry);
}

export async function readCompanionRemoteFramedSyncInventory(
  args: NativeCompanionFramedSyncInventoryRequest
) {
  return decodeCompanionFramedSyncInventory(await FolioleCompanionSync.readFramedSyncInventory(args));
}

export function selectCompanionFramedSyncCurrentNodes(args: {
  local: readonly FramedSyncInventoryEntry[];
  remote: readonly FramedSyncInventoryEntry[];
}) {
  const deferredObjects: FramedSyncDeferredObject[] = [];
  const sendable: FramedSyncInventoryDifference[] = [];
  for (const difference of compareFramedSyncInventories(args)) {
    if (difference.direction !== 'local_to_remote') continue;
    const nodePayloadNeeded = difference.need.sharedState ||
      difference.need.frontierFactIds.length > 0 || difference.need.resourceHashes.length > 0;
    if (difference.objectType === 'node' && nodePayloadNeeded) sendable.push(difference);
    else deferredObjects.push({ globalId: difference.globalId, objectType: difference.objectType });
  }
  return { deferredObjects, sendable };
}

export async function sendCompanionFramedSyncInventoryDifferences(
  args: NativeCompanionFramedSyncInventoryRequest
) {
  const owner = getIosCompanionDatabaseOwner();
  const [localValue, remote] = await Promise.all([
    owner.read(readCompanionFramedSyncInventory),
    readCompanionRemoteFramedSyncInventory(args)
  ]);
  const local = decodeCompanionFramedSyncInventory(localValue);
  const selection = selectCompanionFramedSyncCurrentNodes({ local, remote });
  const deferredObjects = [...selection.deferredObjects];
  const sent: Array<{ objectId: string; receipt: NativeCompanionFramedSyncTransferReceipt }> = [];
  for (const difference of selection.sendable) {
    const currentValue = await owner.read((db) =>
      readCompanionFramedSyncInventoryEntry(db, difference));
    const current = decodeOptionalEntry(currentValue);
    const revalidated = revalidateFramedSyncInventorySource({
      currentSource: current ? [current] : [], differences: [difference],
      direction: 'local_to_remote'
    });
    if (revalidated.deferredObjects.length) {
      deferredObjects.push(...revalidated.deferredObjects);
      continue;
    }
    const receipt = await sendCompanionFramedSyncObject({
      endpointUrl: args.endpoint_url, groupId: args.sync_group_id,
      objectId: difference.globalId, receiverDeviceId: args.receiver_device_id,
      receiverLibraryEpoch: args.receiver_library_epoch
    });
    sent.push({ objectId: difference.globalId, receipt });
  }
  return { deferredObjects, sent };
}
