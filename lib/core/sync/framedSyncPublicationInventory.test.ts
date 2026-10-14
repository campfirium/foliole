import { describe, expect, it } from 'vitest';

import { compareFramedSyncInventories, type FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { decodePublicationInventory, encodePublicationInventory } from './framedSyncPublicationInventory.js';

const hash = (value: number) => new Uint8Array(32).fill(value);
const source: FramedSyncInventoryEntry = { globalId: 'n', objectType: 'node',
  frontierFactIds: ['v'], requiredRelationIds: ['r'], reviewFactIds: ['review'],
  stateFactIds: ['reading'], resourceHashes: [hash(2)], sharedStateHash: hash(1) };
const original = compareFramedSyncInventories({ local: [source], remote: [] })[0]!;

describe('historical publication inventory persistence', () => {
  it('preserves the frozen missing list through persistence', () => {
    expect(decodePublicationInventory(encodePublicationInventory({ blobs: [], facts: [] }, original)))
      .toEqual(original);
  });
  it('rejects malformed comparison evidence', () => {
    expect(() => decodePublicationInventory('{"inventoryDifference": {}}')).toThrow();
  });
});
