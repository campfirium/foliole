import { expect, it } from 'vitest';
import { parseLibraryCapacityResult } from './library-capacity-result.mjs';

export function capacityResult() {
  return { status: 'passed', scenario: 'library-capacity', appId: 'com.foliole.android.acceptance',
    platform: 'android', results: [1000, 10000].map(count => ({
      fixture: { count, bodyBytes: 4096, imports: 0, analyzed: false },
      environment: { version: [{ version: 'test-only' }] }, plans: [{ sql: 'SELECT 1' }], memory: null,
      runs: Array.from({ length: 4 }, () => ({ totalMs: 2, queryWallMs: 1, jsResidualMs: 1, snapshotHash: 'a'.repeat(64) }))
    })) };
}

const encode = result => `INSTRUMENTATION_STATUS: stream=FOLIOLE_LIBRARY_CAPACITY_RESULT=${JSON.stringify(result)}`;

it('accepts complete measurements without pretending unknown memory was measured', () => {
  const result = parseLibraryCapacityResult(encode(capacityResult()));
  expect(result.results[0].memory).toBeNull();
});

it.each(['identity', 'size', 'repeats', 'hash', 'timing'])('rejects invalid %s evidence', field => {
  const result = capacityResult();
  if (field === 'identity') result.appId = 'com.foliole.android';
  if (field === 'size') result.results[0].fixture.count = 1293;
  if (field === 'repeats') result.results[0].runs.pop();
  if (field === 'hash') result.results[0].runs[1].snapshotHash = 'b'.repeat(64);
  if (field === 'timing') result.results[0].runs[0].totalMs = -1;
  expect(() => parseLibraryCapacityResult(encode(result))).toThrow();
});

it('refuses ambiguous duplicated output', () => {
  const line = encode(capacityResult());
  expect(() => parseLibraryCapacityResult(`${line}\n${line}`)).toThrow('one complete');
});
