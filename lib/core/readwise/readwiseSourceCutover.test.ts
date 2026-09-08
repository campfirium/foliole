import { expect, it } from 'vitest';

import {
  normalizeReadwiseSourceCutover,
  READWISE_SOURCE_CUTOVER_VERSION
} from './readwiseSourceCutover.js';

it('accepts the current durable cutover fact and normalizes counters', () => {
  expect(normalizeReadwiseSourceCutover({
    completedAt: '2026-09-08T00:00:00.000Z',
    migratedCount: 4.9,
    sourceHost: 'Mac',
    unmatchedCount: -2,
    version: READWISE_SOURCE_CUTOVER_VERSION
  })).toEqual({
    completedAt: '2026-09-08T00:00:00.000Z',
    migratedCount: 4,
    sourceHost: 'Mac',
    unmatchedCount: 0,
    version: READWISE_SOURCE_CUTOVER_VERSION
  });
});

it('rejects unknown versions and incomplete payloads', () => {
  expect(normalizeReadwiseSourceCutover({ version: 0 })).toBeNull();
  expect(normalizeReadwiseSourceCutover(null)).toBeNull();
});
