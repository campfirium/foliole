// @vitest-environment node

import { expect, it } from 'vitest';

import { resolveBucketPool } from './run-script-test-bucket.mjs';

it('isolates process-heavy core and gate buckets from thread worker leaks', () => {
  expect(resolveBucketPool('core')).toBe('forks');
  expect(resolveBucketPool('core-one')).toBe('forks');
  expect(resolveBucketPool('core-two')).toBe('forks');
  expect(resolveBucketPool('gate')).toBe('forks');
  expect(resolveBucketPool('gate-one')).toBe('forks');
  expect(resolveBucketPool('gate-two')).toBe('forks');
  expect(resolveBucketPool('preview')).toBe('threads');
});
