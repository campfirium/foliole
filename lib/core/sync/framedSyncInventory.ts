import { assertFramedSyncDigest } from './framedSyncContract.js';
import { parseFramedSyncParentRelationFactId } from './framedSyncRelationReviewFact.js';
import { compareSyncIdentityText } from './syncIdentityKeyOrder.js';

export type FramedSyncInventoryEntry = Readonly<{
  frontierFactIds: readonly string[];
  globalId: string;
  objectType: string;
  requiredRelationIds: readonly string[];
  resourceHashes: readonly Uint8Array[];
  reviewFactIds: readonly string[];
  sharedStateHash: Uint8Array;
}>;

export type FramedSyncInventoryNeed = Readonly<{
  frontierFactIds: readonly string[];
  requiredRelationIds: readonly string[];
  resourceHashes: readonly Uint8Array[];
  reviewFactIds: readonly string[];
  sharedState: boolean;
}>;

export type FramedSyncInventoryDifference = Readonly<{
  direction: 'local_to_remote' | 'remote_to_local';
  globalId: string;
  need: FramedSyncInventoryNeed;
  objectType: string;
  sourceSnapshot: FramedSyncInventoryEntry;
}>;

export type FramedSyncDeferredObject = Readonly<{
  globalId: string;
  objectType: string;
}>;

export function requiredFramedSyncNodeVersionIds(difference: FramedSyncInventoryDifference) {
  if (difference.objectType !== 'node') throw new Error('framed_sync_inventory_identity_invalid');
  const ids = new Set(difference.need.frontierFactIds);
  if (difference.need.sharedState || difference.need.resourceHashes.length > 0) {
    for (const id of difference.sourceSnapshot.frontierFactIds) ids.add(id);
  }
  for (const relationId of difference.need.requiredRelationIds) {
    const relation = parseFramedSyncParentRelationFactId(relationId);
    ids.add(relation.version_id);
    ids.add(relation.parent_version_id);
  }
  return [...ids];
}

function compareKey(left: FramedSyncInventoryEntry, right: FramedSyncInventoryEntry) {
  return compareSyncIdentityText(left.objectType, right.objectType) ||
    compareSyncIdentityText(left.globalId, right.globalId);
}

function bytesKey(value: Uint8Array) {
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');
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
  const hashes = entry.resourceHashes.map((hash) =>
    bytesKey(assertFramedSyncDigest(hash, 'resource_hash')));
  if (new Set(hashes).size !== hashes.length) throw new Error('resource_hash_duplicate');
}

function assertInventory(entries: readonly FramedSyncInventoryEntry[]) {
  let previous: FramedSyncInventoryEntry | undefined;
  for (const entry of entries) {
    assertEntry(entry);
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
  return {
    frontierFactIds: missingStrings(source.frontierFactIds, destination?.frontierFactIds ?? []),
    requiredRelationIds: missingStrings(
      source.requiredRelationIds, destination?.requiredRelationIds ?? []),
    resourceHashes: missingHashes(source.resourceHashes, destination?.resourceHashes ?? []),
    reviewFactIds: missingStrings(source.reviewFactIds, destination?.reviewFactIds ?? []),
    sharedState: !destination || !sameBytes(source.sharedStateHash, destination.sharedStateHash)
  } satisfies FramedSyncInventoryNeed;
}

function hasNeed(need: FramedSyncInventoryNeed) {
  return need.sharedState || need.frontierFactIds.length > 0 ||
    need.requiredRelationIds.length > 0 || need.reviewFactIds.length > 0 ||
    need.resourceHashes.length > 0;
}

function cloneEntry(entry: FramedSyncInventoryEntry): FramedSyncInventoryEntry {
  return {
    frontierFactIds: [...entry.frontierFactIds],
    globalId: entry.globalId,
    objectType: entry.objectType,
    requiredRelationIds: [...entry.requiredRelationIds],
    resourceHashes: entry.resourceHashes.map((hash) => hash.slice()),
    reviewFactIds: [...entry.reviewFactIds],
    sharedStateHash: entry.sharedStateHash.slice()
  };
}

function appendDifference(result: FramedSyncInventoryDifference[],
  direction: FramedSyncInventoryDifference['direction'], source: FramedSyncInventoryEntry,
  destination?: FramedSyncInventoryEntry) {
  const need = needFrom(source, destination);
  if (!hasNeed(need)) return;
  result.push({
    direction, globalId: source.globalId, need,
    objectType: source.objectType, sourceSnapshot: cloneEntry(source)
  });
}

export function compareFramedSyncInventories(args: {
  local: readonly FramedSyncInventoryEntry[];
  remote: readonly FramedSyncInventoryEntry[];
}) {
  assertInventory(args.local);
  assertInventory(args.remote);
  const result: FramedSyncInventoryDifference[] = [];
  let localIndex = 0;
  let remoteIndex = 0;
  while (localIndex < args.local.length || remoteIndex < args.remote.length) {
    const local = args.local[localIndex];
    const remote = args.remote[remoteIndex];
    const order = local === undefined ? 1 : remote === undefined ? -1 : compareKey(local, remote);
    if (local && order <= 0) appendDifference(result, 'local_to_remote', local,
      order === 0 ? remote : undefined);
    if (remote && order >= 0) appendDifference(result, 'remote_to_local', remote,
      order === 0 ? local : undefined);
    if (order <= 0) localIndex += 1;
    if (order >= 0) remoteIndex += 1;
  }
  return result;
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

function sameStrings(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const values = new Set(right);
  return left.every((value) => values.has(value));
}

function sameHashes(left: readonly Uint8Array[], right: readonly Uint8Array[]) {
  if (left.length !== right.length) return false;
  const values = new Set(right.map(bytesKey));
  return left.every((value) => values.has(bytesKey(value)));
}

function sameEntry(left: FramedSyncInventoryEntry, right: FramedSyncInventoryEntry) {
  return compareKey(left, right) === 0 && sameBytes(left.sharedStateHash, right.sharedStateHash) &&
    sameStrings(left.frontierFactIds, right.frontierFactIds) &&
    sameStrings(left.requiredRelationIds, right.requiredRelationIds) &&
    sameStrings(left.reviewFactIds, right.reviewFactIds) &&
    sameHashes(left.resourceHashes, right.resourceHashes);
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
    if (current && sameEntry(current, difference.sourceSnapshot)) {
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
