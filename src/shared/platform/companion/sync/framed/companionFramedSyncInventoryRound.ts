import { hexToBytes } from '@noble/hashes/utils.js';

import {
  compareFramedSyncInventories,
  type FramedSyncDeferredObject,
  type FramedSyncInventoryDifference,
  type FramedSyncInventoryEntry
} from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { deliverFramedSyncDifferencesInDependencyOrder, framedSyncOrderBodyDependencies } from '../../../../../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import { loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import type {
  NativeCompanionFramedSyncInventoryEntry,
  NativeCompanionFramedSyncInventoryRequest,
  NativeCompanionFramedSyncInventoryResult,
  NativeCompanionFramedSyncTransferReceipt
} from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';

import { createCompanionFramedSyncDifferenceBatchDelivery } from './companionFramedSyncDifferenceBatchDelivery.js';
import {
  readCompanionFramedSyncInventory
} from './companionFramedSyncInventory.js';
import { decodeCompanionInventoryEntry } from './companionFramedSyncInventoryEntryDecode.js';
import { rememberCompanionFramedSyncPeerRoute } from './companionFramedSyncPeerRoutes.js';
import { resumeCompanionFramedSyncPendingPublications } from './companionFramedSyncPendingPublications.js';
import { createCompanionFramedSyncPullBatchDelivery } from './companionFramedSyncPullBatch.js';
import { runCompanionFramedSyncResourceRound } from './companionFramedSyncResourceRound.js';
import { adoptCompanionSyncGroupData } from './companionSyncGroupLocalAdoption.js';

export { decodeCompanionInventoryEntry } from './companionFramedSyncInventoryEntryDecode.js';

export async function pullInventoryDifferences(args: NativeCompanionFramedSyncInventoryRequest,
  differences: readonly FramedSyncInventoryDifference[], roundId: Uint8Array,
  dependencies: readonly FramedSyncInventoryDifference[]) {
  const received = new Map<string, { objectId: string; receipt: NativeCompanionFramedSyncTransferReceipt }>();
  const deferredObjects = new Map<string, FramedSyncDeferredObject>();
  const deliver = createCompanionFramedSyncPullBatchDelivery(args, differences, roundId, received);
  const defer = (difference: Pick<FramedSyncInventoryDifference, 'globalId' | 'objectType'>) =>
    deferredObjects.set(`${difference.objectType}\0${difference.globalId}`, {
      globalId: difference.globalId, objectType: difference.objectType
    });
  const dependencyDeferred = await deliverFramedSyncDifferencesInDependencyOrder(
    differences, async (difference) => {
    try {
      return await deliver(difference);
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      if (!['framed_sync_difference_request_source_changed', 'framed_sync_source_changed']
        .some((code) => message.endsWith(`:${code}`))) throw error;
      defer(difference);
      return 'deferred';
    }
  }, dependencies);
  for (const difference of dependencyDeferred) defer(difference);
  return {
    deferredObjects: [...deferredObjects.values()],
    received: [...received.values()]
  };
}

export function decodeCompanionFramedSyncInventory(
  value: NativeCompanionFramedSyncInventoryResult
) {
  if (!value || !Array.isArray(value.entries)) throw new Error('framed_sync_inventory_result_invalid');
  const roundId = typeof value.round_id === 'string' && /^[a-f0-9]{32}$/u.test(value.round_id)
    ? hexToBytes(value.round_id)
    : null;
  if (!roundId) throw new Error('framed_sync_inventory_round_id_invalid');
  return { entries: value.entries.map(decodeCompanionInventoryEntry), roundId };
}

export async function readCompanionRemoteFramedSyncInventory(
  args: NativeCompanionFramedSyncInventoryRequest
) {
  const result = decodeCompanionFramedSyncInventory(await FolioleCompanionSync.readFramedSyncInventory(args));
  await rememberCompanionFramedSyncPeerRoute(args);
  return result;
}

export function selectCompanionFramedSyncCurrentNodes(args: {
  local: readonly FramedSyncInventoryEntry[];
  remote: readonly FramedSyncInventoryEntry[];
}) {
  const differences = compareFramedSyncInventories(args);
  return {
    deferredObjects: [] as FramedSyncDeferredObject[],
    pullable: differences.filter((difference) => difference.direction === 'remote_to_local'),
    sendable: differences.filter((difference) => difference.direction === 'local_to_remote')
  };
}

export async function sendCompanionFramedSyncInventoryDifferences(
  args: NativeCompanionFramedSyncInventoryRequest, resourcesOnly = false
) {
  const adoption = await getIosCompanionDatabaseOwner().read(loadSyncGroupLocalAdoption);
  if (adoption && !resourcesOnly) return adoptCompanionSyncGroupData(args, adoption);
  if (adoption && (adoption.groupId !== args.sync_group_id || adoption.providerDeviceId !== args.receiver_device_id)) {
    throw new Error('sync_group_local_adoption_source_mismatch');
  }
  const owner = getIosCompanionDatabaseOwner();
  let [localValue, remoteResult] = await Promise.all([
    owner.read((db) => readCompanionFramedSyncInventory(db)),
    readCompanionRemoteFramedSyncInventory(args)
  ]);
  if (resourcesOnly) {
    const resources = await runCompanionFramedSyncResourceRound(args, remoteResult.roundId,
      inventoryNodeIds(localValue.entries, remoteResult.entries));
    return { deferredObjects: [], received: [], sent: [], resources };
  }
  if (await resumeCompanionFramedSyncPendingPublications(args, remoteResult.entries)) {
    [localValue, remoteResult] = await Promise.all([
      owner.read((db) => readCompanionFramedSyncInventory(db)), readCompanionRemoteFramedSyncInventory(args)
    ]);
  }
  const local = localValue.entries.map(decodeCompanionInventoryEntry);
  const selection = selectCompanionFramedSyncCurrentNodes({ local, remote: remoteResult.entries });
  const deferredObjects = [...selection.deferredObjects];
  const dependencies = framedSyncOrderBodyDependencies({ local, remote: remoteResult.entries });
  const pulled = await pullInventoryDifferences(args, selection.pullable, remoteResult.roundId,
    dependencies.filter((difference) => difference.direction === 'remote_to_local'));
  deferredObjects.push(...pulled.deferredObjects);
  const sent: Array<{ objectId: string; receipt: NativeCompanionFramedSyncTransferReceipt }> = [];
  const deliver = createCompanionFramedSyncDifferenceBatchDelivery(args, selection.sendable, sent);
  const sendDeferred = await deliverFramedSyncDifferencesInDependencyOrder(selection.sendable,
    deliver,
    dependencies.filter((difference) => difference.direction === 'local_to_remote'));
  deferredObjects.push(...sendDeferred.map(({ globalId, objectType }) => ({ globalId, objectType })));
  const nodes = inventoryNodeIds(localValue.entries, remoteResult.entries);
  const resources = await runCompanionFramedSyncResourceRound(args, remoteResult.roundId, nodes);
  return { deferredObjects, received: pulled.received, sent, resources };
}

function inventoryNodeIds(local: readonly NativeCompanionFramedSyncInventoryEntry[],
  remote: readonly FramedSyncInventoryEntry[]) {
  return new Set([...local.filter(entry => entry.object_type === 'node').map(entry => entry.global_id),
    ...remote.filter(entry => entry.objectType === 'node').map(entry => entry.globalId)]);
}
