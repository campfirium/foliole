import { hexToBytes } from '@noble/hashes/utils.js';


import { compareFramedSyncDatabaseInventories } from '../../../../../../lib/core/sync/framedSyncDatabaseDifference.js';
import {
  type FramedSyncDeferredObject,
  type FramedSyncInventoryDifference,
  type FramedSyncInventoryEntry
} from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { deliverFramedSyncDifferencesInDependencyOrder, framedSyncOrderBodyDependencies } from '../../../../../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import { differingNodeIds } from '../../../../../../lib/core/sync/framedSyncInventorySummary.js';
import { loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { loadLatestSyncGroupRestoreEvent } from '../../../../../../lib/core/sync/syncGroupRestoreEvents.js';
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
import { adoptCompanionSyncGroupData, restoreCompanionSyncGroupData } from './companionSyncGroupLocalAdoption.js';

export { decodeCompanionInventoryEntry } from './companionFramedSyncInventoryEntryDecode.js';

export async function pullInventoryDifferences(args: NativeCompanionFramedSyncInventoryRequest,
  differences: readonly FramedSyncInventoryDifference[], roundId: Uint8Array,
  dependencies: readonly FramedSyncInventoryDifference[]) {
  const deliveredDifferences: FramedSyncInventoryDifference[] = [];
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
      const state = await deliver(difference);
      if (state === 'delivered') deliveredDifferences.push(difference);
      return state;
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
    deliveredDifferences,
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
  const result = decodeCompanionFramedSyncInventory(await FolioleCompanionSync.readFramedSyncInventory({ ...args, summary_only: true }));
  const local = await getIosCompanionDatabaseOwner().read(readCompanionFramedSyncInventory);
  const detailIds = differingNodeIds(local.entries.map(decodeCompanionInventoryEntry), result.entries);
  if (detailIds.length) {
    const details = decodeCompanionFramedSyncInventory(await FolioleCompanionSync.readFramedSyncInventory({ ...args,
      summary_only: true, detail_global_ids: detailIds }));
    const byId = new Map(details.entries.map(entry => [entry.globalId, entry]));
    await rememberCompanionFramedSyncPeerRoute(args);
    return { entries: result.entries.map(entry => entry.objectType === 'node' ? byId.get(entry.globalId) ?? entry : entry), roundId: details.roundId };
  }
  await rememberCompanionFramedSyncPeerRoute(args);
  return result;
}

export function selectCompanionFramedSyncCurrentNodes(args: {
  local: readonly FramedSyncInventoryEntry[];
  remote: readonly FramedSyncInventoryEntry[];
}) {
  const differences = compareFramedSyncDatabaseInventories(args);
  return {
    deferredObjects: [] as FramedSyncDeferredObject[],
    pullable: differences.filter((difference) => difference.direction === 'remote_to_local'),
    sendable: differences.filter((difference) => difference.direction === 'local_to_remote')
  };
}

export async function sendCompanionFramedSyncInventoryDifferences(
  args: NativeCompanionFramedSyncInventoryRequest, resourcesOnly = false, restoreId?: string
) {
  const adoption = await getIosCompanionDatabaseOwner().read(loadSyncGroupLocalAdoption);
  const adoptionReceived: Array<{ objectId: string; receipt: NativeCompanionFramedSyncTransferReceipt }> = [];
  if (restoreId) {
    if (adoption) throw new Error('framed_sync_restore_state_invalid');
    const restored = await restoreCompanionSyncGroupData(args, restoreId);
    if (restored) {
      const restore = await getIosCompanionDatabaseOwner().read((db) => loadLatestSyncGroupRestoreEvent(db, args.sync_group_id));
      if (!restore?.applied) return restored;
      adoptionReceived.push(...restored.received);
    }
  }
  if (adoption && !resourcesOnly) {
    const adopted = await adoptCompanionSyncGroupData(args, adoption);
    if (await getIosCompanionDatabaseOwner().read(loadSyncGroupLocalAdoption)) return adopted;
    adoptionReceived.push(...adopted.received);
  }
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
    return { deferredObjects: [], received: adoptionReceived, sent: [], resources };
  }
  if (await resumeCompanionFramedSyncPendingPublications(args, remoteResult.entries)) {
    [localValue, remoteResult] = await Promise.all([
      owner.read((db) => readCompanionFramedSyncInventory(db)), readCompanionRemoteFramedSyncInventory(args)
    ]);
  }
  const result = await reconcileDatabaseRounds(args, { localValue, remoteResult });
  const nodes = inventoryNodeIds(result.inventory.localValue.entries, result.inventory.remoteResult.entries);
  const resources = await runCompanionFramedSyncResourceRound(args, result.inventory.remoteResult.roundId, nodes);
  return { deferredObjects: result.deferredObjects, received: [...adoptionReceived, ...result.received], sent: result.sent, resources };
}

type RoundInventory = {
  localValue: Awaited<ReturnType<typeof readCompanionFramedSyncInventory>>;
  remoteResult: Awaited<ReturnType<typeof readCompanionRemoteFramedSyncInventory>>;
};

async function captureInventory(args: NativeCompanionFramedSyncInventoryRequest): Promise<RoundInventory> {
  const [localValue, remoteResult] = await Promise.all([
    getIosCompanionDatabaseOwner().read(readCompanionFramedSyncInventory),
    readCompanionRemoteFramedSyncInventory(args)
  ]);
  return { localValue, remoteResult };
}

function decodedInventory(inventory: RoundInventory) {
  return { local: inventory.localValue.entries.map(decodeCompanionInventoryEntry),
    remote: inventory.remoteResult.entries };
}

async function reconcileDatabaseRounds(args: NativeCompanionFramedSyncInventoryRequest, initial: RoundInventory) {
  let inventory = initial;
  const received: Array<{ objectId: string; receipt: NativeCompanionFramedSyncTransferReceipt }> = [];
  const sent: typeof received = [];
  for (;;) {
    const before = decodedInventory(inventory);
    const selection = selectCompanionFramedSyncCurrentNodes(before);
    if (!selection.pullable.length && !selection.sendable.length) {
      return { inventory, received, sent, deferredObjects: [] };
    }
    const round = await transferDatabaseRound(args, inventory.remoteResult.roundId, before, selection);
    received.push(...round.received);
    sent.push(...round.sent);
    inventory = await captureInventory(args);
    const after = decodedInventory(inventory);
    const changed = JSON.stringify(before.local) !== JSON.stringify(after.local) || JSON.stringify(before.remote) !== JSON.stringify(after.remote);
    if (!changed) {
      const remaining = compareFramedSyncDatabaseInventories(after);
      const deferred = new Map([...round.deferredObjects, ...remaining]
        .map(({ globalId, objectType }) => [`${objectType}\0${globalId}`, { globalId, objectType }]));
      return { inventory, received, sent, deferredObjects: [...deferred.values()] };
    }
  }
}

async function transferDatabaseRound(args: NativeCompanionFramedSyncInventoryRequest, roundId: Uint8Array,
  inventory: ReturnType<typeof decodedInventory>, selection: ReturnType<typeof selectCompanionFramedSyncCurrentNodes>) {
  const dependencies = framedSyncOrderBodyDependencies(inventory);
  const pulled = await pullInventoryDifferences(args, selection.pullable, roundId,
    dependencies.filter(difference => difference.direction === 'remote_to_local'));
  const sent: Array<{ objectId: string; receipt: NativeCompanionFramedSyncTransferReceipt }> = [];
  const deliver = createCompanionFramedSyncDifferenceBatchDelivery(args, selection.sendable, sent);
  const sendDeferred = await deliverFramedSyncDifferencesInDependencyOrder(selection.sendable, deliver,
    dependencies.filter(difference => difference.direction === 'local_to_remote'));
  return { received: pulled.received, sent, deferredObjects: [...pulled.deferredObjects,
    ...sendDeferred.map(({ globalId, objectType }) => ({ globalId, objectType }))] };
}

function inventoryNodeIds(local: readonly NativeCompanionFramedSyncInventoryEntry[],
  remote: readonly FramedSyncInventoryEntry[]) {
  return new Set([...local.filter(entry => entry.object_type === 'node').map(entry => entry.global_id),
    ...remote.filter(entry => entry.objectType === 'node').map(entry => entry.globalId)]);
}
