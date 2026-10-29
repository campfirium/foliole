import { bytesToHex } from '@noble/hashes/utils.js';

import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';

const bytesKey = bytesToHex;

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength &&
    left.every((byte, index) => byte === right[index]);
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

export function sameFramedSyncInventoryEntry(left: FramedSyncInventoryEntry, right: FramedSyncInventoryEntry) {
  return left.objectType === right.objectType && left.globalId === right.globalId && sameBytes(left.sharedStateHash, right.sharedStateHash) &&
    sameStrings(left.dailyFlowNodeIds ?? [], right.dailyFlowNodeIds ?? []) &&
    left.dailyFlowRootId === right.dailyFlowRootId &&
    left.dailyFlowComplete === right.dailyFlowComplete && left.dailyFlowCurrent === right.dailyFlowCurrent &&
    left.currentVersionId === right.currentVersionId && Boolean(left.unready) === Boolean(right.unready) &&
    sameStrings(left.versionStates ?? [], right.versionStates ?? []) &&
    sameStrings(left.frontierFactIds, right.frontierFactIds) &&
    sameStrings(left.requiredRelationIds, right.requiredRelationIds) &&
    sameStrings(left.reviewFactIds, right.reviewFactIds) &&
    sameStrings(left.stateFactIds ?? [], right.stateFactIds ?? []) &&
    sameHashes(left.resourceHashes, right.resourceHashes);
}
