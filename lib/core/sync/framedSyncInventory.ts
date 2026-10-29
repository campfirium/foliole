import { bytesToHex } from '@noble/hashes/utils.js';

import { assertFramedSyncDigest } from './framedSyncContract.js';
import { sameFramedSyncInventoryEntry } from './framedSyncInventoryEntryEquality.js';
import { changedNodeVersionIds, missingNodeRelationIds, needsNodeCurrentReference } from './framedSyncNodeInventoryState.js';
import { compareSyncFactText } from './syncFactKeyOrder.js';

export type FramedSyncInventoryEntry = Readonly<{
  frontierFactIds: readonly string[];
  globalId: string;
  objectType: string;
  requiredRelationIds: readonly string[];
  resourceHashes: readonly Uint8Array[];
  reviewFactIds: readonly string[];
  sharedStateHash: Uint8Array;
  stateFactIds?: readonly string[];
  currentVersionId?: string | undefined;
  versionStates?: readonly string[] | undefined;
  unready?: boolean | undefined;
  dailyFlowComplete?: boolean;
  dailyFlowRootId?: string;
  dailyFlowCurrent?: boolean;
  dailyFlowNodeIds?: readonly string[];
}>;

export type FramedSyncInventoryNeed = Readonly<{
  frontierFactIds: readonly string[];
  requiredRelationIds: readonly string[];
  resourceHashes: readonly Uint8Array[];
  reviewFactIds: readonly string[];
  sharedState: boolean;
  stateFactIds?: readonly string[];
}>;

export type FramedSyncInventoryDifference = Readonly<{
  direction: 'local_to_remote' | 'remote_to_local';
  globalId: string;
  need: FramedSyncInventoryNeed;
  objectType: string;
  sourceSnapshot: FramedSyncInventoryEntry;
}>;

type Inventories = { local: readonly FramedSyncInventoryEntry[]; remote: readonly FramedSyncInventoryEntry[] };

export type FramedSyncDeferredObject = Readonly<{
  globalId: string;
  objectType: string;
}>;

export function requiredFramedSyncNodeVersionIds(difference: FramedSyncInventoryDifference) {
  if (difference.objectType !== 'node') throw new Error('framed_sync_inventory_identity_invalid');
  return [...difference.need.frontierFactIds];
}

function compareKey(left: FramedSyncInventoryEntry, right: FramedSyncInventoryEntry) {
  return compareSyncFactText(left.objectType, right.objectType) ||
    compareSyncFactText(left.globalId, right.globalId);
}

function bytesKey(value: Uint8Array) {
  return bytesToHex(value);
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength &&
    left.every((byte, index) => byte === right[index]);
}

function assertUnique(values: readonly string[], name: string) {
  if (values.some((value) => !value)) throw new Error(`${name}_required`);
  if (new Set(values).size !== values.length) throw new Error(`${name}_duplicate`);
}

function assertEntry(entry: FramedSyncInventoryEntry) {
  if (!entry.objectType || !entry.globalId) throw new Error('framed_sync_inventory_identity_invalid');
  assertFramedSyncDigest(entry.sharedStateHash, 'shared_state_hash');
  assertUnique(entry.frontierFactIds, 'frontier_fact_id');
  assertUnique(entry.requiredRelationIds, 'required_relation_id');
  assertUnique(entry.reviewFactIds, 'review_fact_id');
  assertUnique(entry.stateFactIds ?? [], 'state_fact_id');
  const hashes = entry.resourceHashes.map((hash) =>
    bytesKey(assertFramedSyncDigest(hash, 'resource_hash')));
  if (new Set(hashes).size !== hashes.length) throw new Error('resource_hash_duplicate');
}

export type FramedSyncInventoryObserver = (entry: FramedSyncInventoryEntry, side: keyof Inventories, index: number) => void;

function assertInventory(entries: readonly FramedSyncInventoryEntry[], observe?: (entry: FramedSyncInventoryEntry, index: number) => void) {
  let previous: FramedSyncInventoryEntry | undefined;
  for (const [index, entry] of entries.entries()) {
    assertEntry(entry);
    observe?.(entry, index);
    if (previous && compareKey(previous, entry) >= 0) {
      throw new Error('framed_sync_inventory_order_invalid');
    }
    previous = entry;
  }
}

function missingStrings(source: readonly string[], destination: readonly string[]) {
  const present = new Set(destination);
  return source.filter((value) => !present.has(value));
}

function missingHashes(source: readonly Uint8Array[], destination: readonly Uint8Array[]) {
  const present = new Set(destination.map(bytesKey));
  return source.filter((value) => !present.has(bytesKey(value))).map((value) => value.slice());
}

function needFrom(source: FramedSyncInventoryEntry, destination?: FramedSyncInventoryEntry) {
  const versionIds = source.versionStates ? changedNodeVersionIds(source, destination) :
    missingStrings(source.frontierFactIds, destination?.frontierFactIds ?? []);
  const resourceHashes = missingHashes(source.resourceHashes, destination?.resourceHashes ?? []);
  return {
    frontierFactIds: versionIds,
    requiredRelationIds: source.versionStates ? missingNodeRelationIds(source, destination) : missingStrings(
      source.requiredRelationIds, destination?.requiredRelationIds ?? []),
    resourceHashes,
    reviewFactIds: missingStrings(source.reviewFactIds, destination?.reviewFactIds ?? []),
    stateFactIds: source.objectType === 'external_document' && resourceHashes.length > 0
      ? [...source.stateFactIds ?? []]
      : missingStrings(source.stateFactIds ?? [], destination?.stateFactIds ?? []),
    sharedState: source.objectType === 'node' && source.versionStates ? needsNodeCurrentReference(source, destination)
      : !destination || !sameBytes(source.sharedStateHash, destination.sharedStateHash)
  } satisfies FramedSyncInventoryNeed;
}

function hasNeed(need: FramedSyncInventoryNeed) {
  return need.sharedState || need.frontierFactIds.length > 0 ||
    need.requiredRelationIds.length > 0 || need.reviewFactIds.length > 0 ||
    (need.stateFactIds?.length ?? 0) > 0 ||
    need.resourceHashes.length > 0;
}

function cloneEntry(entry: FramedSyncInventoryEntry): FramedSyncInventoryEntry {
  return {
    ...entry,
    frontierFactIds: [...entry.frontierFactIds],
    ...(entry.dailyFlowNodeIds ? { dailyFlowNodeIds: [...entry.dailyFlowNodeIds] } : {}),
    globalId: entry.globalId,
    objectType: entry.objectType,
    requiredRelationIds: [...entry.requiredRelationIds],
    resourceHashes: entry.resourceHashes.map((hash) => hash.slice()),
    reviewFactIds: [...entry.reviewFactIds],
    stateFactIds: [...(entry.stateFactIds ?? [])],
    sharedStateHash: entry.sharedStateHash.slice()
  };
}

function differenceFrom(
  direction: FramedSyncInventoryDifference['direction'], source: FramedSyncInventoryEntry,
  destination?: FramedSyncInventoryEntry) {
  if (destination && !source.unready && !destination.unready &&
      sameBytes(source.sharedStateHash, destination.sharedStateHash) && source.objectType === 'node') {
    const resources = missingHashes(source.resourceHashes, destination.resourceHashes);
    if (!resources.length) return null;
    return { direction, globalId: source.globalId, objectType: source.objectType, sourceSnapshot: cloneEntry(source),
      need: { frontierFactIds: [], requiredRelationIds: [], reviewFactIds: [], stateFactIds: [], sharedState: false, resourceHashes: resources } };
  }
  if (source.objectType === 'daily_flow' && source.dailyFlowRootId === source.globalId && !source.dailyFlowComplete) return null;
  const need = needFrom(source, destination);
  if (source.dailyFlowComplete && !destination?.dailyFlowComplete) {
    need.sharedState = true;
    need.stateFactIds = [...source.stateFactIds ?? []];
  }
  if (!hasNeed(need)) return null;
  return {
    direction, globalId: source.globalId, need,
    objectType: source.objectType, sourceSnapshot: cloneEntry(source)
  } satisfies FramedSyncInventoryDifference;
}

export function compareFramedSyncInventories(args: Inventories): FramedSyncInventoryDifference[] {
  return Array.from(iterateFramedSyncInventoryDifferences(args));
}

export function* iterateFramedSyncInventoryDifferences(args: Inventories, observe?: FramedSyncInventoryObserver): Generator<FramedSyncInventoryDifference> {
  assertInventory(args.local, (entry, index) => observe?.(entry, 'local', index));
  assertInventory(args.remote, (entry, index) => observe?.(entry, 'remote', index));
  let localIndex = 0;
  let remoteIndex = 0;
  while (localIndex < args.local.length || remoteIndex < args.remote.length) {
    const local = args.local[localIndex];
    const remote = args.remote[remoteIndex];
    const order = local === undefined ? 1 : remote === undefined ? -1 : compareKey(local, remote);
    if (local && order <= 0) {
      const difference = differenceFrom('local_to_remote', local, order === 0 ? remote : undefined);
      if (difference) yield difference;
    }
    if (remote && order >= 0) {
      const difference = differenceFrom('remote_to_local', remote, order === 0 ? local : undefined);
      if (difference) yield difference;
    }
    if (order <= 0) localIndex += 1;
    if (order >= 0) remoteIndex += 1;
  }
}

function inventoryMap(entries: readonly FramedSyncInventoryEntry[]) {
  assertInventory(entries);
  const result = new Map<string, Map<string, FramedSyncInventoryEntry>>();
  for (const entry of entries) {
    const byId = result.get(entry.objectType) ?? new Map<string, FramedSyncInventoryEntry>();
    byId.set(entry.globalId, entry);
    result.set(entry.objectType, byId);
  }
  return result;
}

export function revalidateFramedSyncInventorySource(args: {
  currentSource: readonly FramedSyncInventoryEntry[];
  direction: FramedSyncInventoryDifference['direction'];
  differences: readonly FramedSyncInventoryDifference[];
}) {
  const currentSource = inventoryMap(args.currentSource);
  const readyDifferences: FramedSyncInventoryDifference[] = [];
  const deferred = new Map<string, FramedSyncDeferredObject>();
  for (const difference of args.differences) {
    if (difference.direction !== args.direction) continue;
    const current = currentSource.get(difference.objectType)?.get(difference.globalId);
    if (current && sameFramedSyncInventoryEntry(current, difference.sourceSnapshot)) {
      readyDifferences.push(difference);
    } else {
      const key = JSON.stringify([difference.objectType, difference.globalId]);
      deferred.set(key, { globalId: difference.globalId, objectType: difference.objectType });
    }
  }
  return { deferredObjects: [...deferred.values()], readyDifferences };
}

export function classifyFramedSyncInventoryRound(args: {
  deferredObjects: readonly FramedSyncDeferredObject[];
  outstandingDifferences: readonly FramedSyncInventoryDifference[];
}): 'pending' | 'drained' | 'converged' {
  if (args.outstandingDifferences.length > 0) return 'pending';
  return args.deferredObjects.length > 0 ? 'drained' : 'converged';
}
