import { sha256 } from '@noble/hashes/sha2.js';
import { expect, it } from 'vitest';

import { compareFramedSyncDatabaseInventories } from './framedSyncDatabaseDifference.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { differingInventoryBuckets, inventoryBucket, summarizeInventoryBuckets } from './framedSyncInventoryBuckets.js';

function entry(id: string, value = id, objectType = 'node'): FramedSyncInventoryEntry {
  const sharedStateHash = sha256(new TextEncoder().encode(value));
  return { globalId: id, objectType, sharedStateHash, frontierFactIds: [], requiredRelationIds: [],
    reviewFactIds: [], stateFactIds: objectType === 'node' ? [] : [value], resourceHashes: [] };
}

it.each(['equal', 'edit', 'add', 'delete', 'unready', 'all', 'external-body'] as const)(
  'preserves full database differences for %s', scenario => {
    const local = Array.from({ length: 100 }, (_, i) => entry(`n${String(i).padStart(3, '0')}`));
    let remote = [...local];
    if (scenario === 'edit') remote[10] = entry('n010', 'changed');
    if (scenario === 'add') remote.push(entry('n101'));
    if (scenario === 'delete') remote = remote.slice(1);
    if (scenario === 'unready') remote[10] = { ...remote[10]!, unready: true };
    if (scenario === 'all') remote = remote.map(item => entry(item.globalId, `other-${item.globalId}`));
    if (scenario === 'external-body') {
      local.unshift(entry('document', 'body', 'external_document'));
      remote.unshift({ ...local[0]!, resourceHashes: [new Uint8Array(32).fill(1)] });
    }
    const buckets = new Set(differingInventoryBuckets(summarizeInventoryBuckets(local), summarizeInventoryBuckets(remote)));
    const partial = { local: local.filter(item => buckets.has(inventoryBucket(item))),
      remote: remote.filter(item => buckets.has(inventoryBucket(item))) };
    expect(compareFramedSyncDatabaseInventories(partial)).toEqual(compareFramedSyncDatabaseInventories({ local, remote }));
    if (scenario === 'equal') expect(buckets.size).toBe(0);
    if (scenario === 'edit' || scenario === 'unready') expect(buckets.size).toBe(1);
  }
);

it('expands a small part of both fixed library scales for one edit', () => {
  for (const count of [5150, 35000]) {
    const entries = Array.from({ length: count }, (_, index) => entry(`node-${index}`));
    const changed = [...entries];
    changed[0] = entry('node-0', 'modified');
    const summary = summarizeInventoryBuckets(entries);
    expect(summary.hashes.length).toBe(32768);
    const buckets = differingInventoryBuckets(summary, summarizeInventoryBuckets(changed));
    expect(buckets).toHaveLength(1);
    expect(entries.filter(item => buckets.includes(inventoryBucket(item))).length).toBeLessThan(70);
  }
});

it('forces unready entries to expand even when both summaries are byte-identical', () => {
  const original = entry('missing');
  const summary = summarizeInventoryBuckets([{ ...original, unready: true }]);
  expect(differingInventoryBuckets(summary, summary)).toEqual([inventoryBucket(original)]);
});
