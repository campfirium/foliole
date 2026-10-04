import { expect, it } from 'vitest';

import { isSyncIdentitySourceEpoch } from './syncIdentitySourceEpoch.js';

it('accepts both original and restore-published source epochs', () => {
  expect(isSyncIdentitySourceEpoch('a'.repeat(32))).toBe(true);
  expect(isSyncIdentitySourceEpoch('restore-90a8dd81-884c-45bb-9b8e-8a7ebe57f8ce'))
    .toBe(true);
});

it('rejects missing, padded, and unbounded source epochs', () => {
  for (const value of [null, '', ' restore-id', 'restore-id ', 'a'.repeat(257)]) {
    expect(isSyncIdentitySourceEpoch(value)).toBe(false);
  }
});
