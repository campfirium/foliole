import { expect, it } from 'vitest';

import {
  normalizeReadwiseSourceCutover,
  READWISE_SOURCE_CUTOVER_VERSION
} from './readwiseSourceCutover.js';

it('accepts the current durable cutover fact and normalizes counters', () => {
  expect(normalizeReadwiseSourceCutover({
    completedAt: '2026-09-08T00:00:00.000Z',
    completedCandidateCount: 3.9,
    migratedCount: 4.9,
    sourceHost: 'Mac',
    startedAt: '2026-09-08T00:00:00.000Z',
    status: 'api',
    totalCandidateCount: 4.2,
    unmatchedCount: -2,
    version: READWISE_SOURCE_CUTOVER_VERSION
  })).toEqual({
    completedAt: '2026-09-08T00:00:00.000Z',
    completedCandidateCount: 3,
    migratedCount: 4,
    sourceHost: 'Mac',
    startedAt: '2026-09-08T00:00:00.000Z',
    status: 'api',
    totalCandidateCount: 4,
    unmatchedCount: 0,
    version: READWISE_SOURCE_CUTOVER_VERSION
  });
});

it('rejects unknown versions and incomplete payloads', () => {
  expect(normalizeReadwiseSourceCutover({ version: 0 })).toBeNull();
  expect(normalizeReadwiseSourceCutover(null)).toBeNull();
});
