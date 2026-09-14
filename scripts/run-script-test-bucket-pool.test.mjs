// @vitest-environment node

import { expect, it } from 'vitest';

import { resolveBucketPool } from './run-script-test-bucket.mjs';

it('isolates the process-heavy core bucket from thread worker leaks', () => {
  expect(resolveBucketPool('core')).toBe('forks');
  expect(resolveBucketPool('gate')).toBe('threads');
  expect(resolveBucketPool('preview')).toBe('threads');
});
