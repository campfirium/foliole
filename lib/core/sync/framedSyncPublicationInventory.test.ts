import { describe, expect, it } from 'vitest';

import { compareFramedSyncInventories, type FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { decodePublicationInventory, encodePublicationInventory,
  recheckPublicationInventory } from './framedSyncPublicationInventory.js';

const hash = (value: number) => new Uint8Array(32).fill(value);
const source: FramedSyncInventoryEntry = { globalId: 'n', objectType: 'node',
  frontierFactIds: ['v'], requiredRelationIds: ['r'], reviewFactIds: ['review'],
  stateFactIds: ['reading'], resourceHashes: [hash(2)], sharedStateHash: hash(1) };
const original = compareFramedSyncInventories({ local: [source], remote: [] })[0]!;

describe('publication recovery uses discovery comparison', () => {
  it('writes off an already present input without a historical receipt', () => {
    expect(recheckPublicationInventory(original, [source])).toBeNull();
  });
  it('keeps missing resources even when the current value agrees', () => {
    const pending = recheckPublicationInventory(original, [{ ...source, resourceHashes: [] }]);
    expect(pending?.need).toEqual({ frontierFactIds: [], requiredRelationIds: [],
      reviewFactIds: [], stateFactIds: [], resourceHashes: [hash(2)], sharedState: false });
  });
  it('does not add previously unselected facts to the outstanding list', () => {
    const partial = { ...original, need: { ...original.need, sharedState: false,
      frontierFactIds: [], requiredRelationIds: [], stateFactIds: [], resourceHashes: [] } };
    expect(recheckPublicationInventory(partial, [{ ...source, reviewFactIds: [], sharedStateHash: hash(3) }])?.need)
      .toEqual(partial.need);
    expect(recheckPublicationInventory(partial, [{ ...source, frontierFactIds: [],
      sharedStateHash: hash(3) }])).toBeNull();
  });
  it('preserves the frozen missing list through persistence', () => {
    expect(decodePublicationInventory(encodePublicationInventory({ blobs: [], facts: [] }, original)))
      .toEqual(original);
  });
  it('rejects malformed comparison evidence', () => {
    expect(() => recheckPublicationInventory(original, [source, source])).toThrow();
    expect(() => decodePublicationInventory('{"inventoryDifference": {}}')).toThrow();
  });
});
