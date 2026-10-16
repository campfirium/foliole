import { sha256 } from '@noble/hashes/sha2.js';

import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { compareSyncFactText } from './syncFactKeyOrder.js';

export const INVENTORY_BUCKET_COUNT = 1024;
const encoder = new TextEncoder();
export type InventoryBuckets = { hashes: Uint8Array; unready: number[] };

export function inventoryBucket(entry: Pick<FramedSyncInventoryEntry, 'objectType' | 'globalId'>) {
  const hash = sha256(encoder.encode(JSON.stringify([entry.objectType, entry.globalId])));
  return ((hash[0]! << 8) | hash[1]!) % INVENTORY_BUCKET_COUNT;
}

export function summarizeInventoryBuckets(entries: readonly FramedSyncInventoryEntry[]): InventoryBuckets {
  const buckets = Array.from({ length: INVENTORY_BUCKET_COUNT }, () => sha256.create());
  const unready = new Set<number>();
  const sorted = [...entries].sort((a, b) => compareSyncFactText(a.objectType, b.objectType) ||
    compareSyncFactText(a.globalId, b.globalId));
  let previous = '';
  for (const entry of sorted) {
    const key = JSON.stringify([entry.objectType, entry.globalId]);
    if (key === previous) throw new Error('inventory_entry_part_duplicate');
    previous = key;
    const bucket = inventoryBucket(entry);
    if (entry.unready) unready.add(bucket);
    const facts = entry.objectType === 'node' ? [] : [...entry.stateFactIds ?? []].sort(compareSyncFactText);
    // External body availability participates in the existing database difference calculation.
    const resources = entry.objectType === 'external_document'
      ? entry.resourceHashes.map(hash => [...hash]).sort((a, b) => compareSyncFactText(JSON.stringify(a), JSON.stringify(b))) : [];
    buckets[bucket]!.update(encoder.encode(JSON.stringify([key, [...entry.sharedStateHash], facts, resources])));
  }
  const hashes = new Uint8Array(INVENTORY_BUCKET_COUNT * 32);
  buckets.forEach((hash, index) => hashes.set(hash.digest(), index * 32));
  return { hashes, unready: [...unready].sort((a, b) => a - b) };
}

export function differingInventoryBuckets(left: InventoryBuckets, right: InventoryBuckets) {
  if (left.hashes.length !== INVENTORY_BUCKET_COUNT * 32 || right.hashes.length !== INVENTORY_BUCKET_COUNT * 32) {
    throw new Error('inventory_bucket_summary_invalid');
  }
  const unready = new Set([...left.unready, ...right.unready]);
  return Array.from({ length: INVENTORY_BUCKET_COUNT }, (_, index) => index).filter(index =>
    unready.has(index) || !left.hashes.subarray(index * 32, (index + 1) * 32)
      .every((byte, offset) => right.hashes[index * 32 + offset] === byte));
}
