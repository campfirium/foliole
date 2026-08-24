import { expect, it } from 'vitest';

import { isCompanionAutoSyncEligible } from './companionAutoSyncEligibility';

const READY = {
  hasCompletedSync: true,
  pairingUsable: true,
  participating: true,
  providerAvailable: true
};

it('keeps the first post-pairing sync explicit', () => {
  expect(isCompanionAutoSyncEligible({ ...READY, hasCompletedSync: false })).toBe(false);
});

it('waits for current foreground provider availability before automatic sync', () => {
  expect(isCompanionAutoSyncEligible({ ...READY, providerAvailable: false })).toBe(false);
  expect(isCompanionAutoSyncEligible(READY)).toBe(true);
});
