import { describe, expect, it } from 'vitest';

import { runCompleteMemberDataPlaneConformance } from '../../lib/core/sync/completeMemberDataPlaneConformance.js';

import { SqliteCompleteMemberTestAdapter } from './completeMemberDataPlaneTestAdapter.js';

const journeys = [
  ['android', 'electron', 'ios'],
  ['electron', 'ios', 'android'],
  ['ios', 'android', 'electron']
] as const;

describe('complete member host adapter conformance', () => {
  it.each(journeys)('%s supplies through %s and round-trips into %s', async (sourceHost, peerHost, destinationHost) => {
    const adapters = [sourceHost, peerHost, destinationHost]
      .map((host) => new SqliteCompleteMemberTestAdapter(host));
    try {
      await expect(runCompleteMemberDataPlaneConformance(adapters[0]!, adapters[1]!, adapters[2]!))
        .resolves.toEqual({ destination: destinationHost, peer: peerHost, source: sourceHost });
    } finally {
      adapters.forEach((adapter) => adapter.close());
    }
  });
});
