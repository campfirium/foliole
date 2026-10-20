// @vitest-environment node

import { expect, it } from 'vitest';

import {
  selectSharedTestBuckets, SHARED_TEST_BUCKETS, SHARED_TEST_PARTS
} from './shared-test-bucket-config.mjs';

it('partitions every shared bucket into exactly one hosted part, keeping bucket order', () => {
  const parts = SHARED_TEST_PARTS.map((part) => selectSharedTestBuckets(part));
  expect(parts.every((buckets) => buckets.length > 0)).toBe(true);
  const labels = parts.flat().map(({ label }) => label);
  expect(new Set(labels).size).toBe(labels.length);
  expect([...labels].sort()).toEqual(SHARED_TEST_BUCKETS.map(({ label }) => label).sort());
  for (const buckets of parts) {
    const order = buckets.map((bucket) => SHARED_TEST_BUCKETS.indexOf(bucket));
    expect(order).toEqual([...order].sort((left, right) => left - right));
  }
});

it('keeps native library and companion sync in the first part and features in the second', () => {
  const one = selectSharedTestBuckets('one').map(({ label }) => label);
  const two = selectSharedTestBuckets('two').map(({ label }) => label);
  expect(one).toEqual(expect.arrayContaining(['lib-native', 'lib', 'shared-platform-companion-sync']));
  expect(two).toEqual(expect.arrayContaining(['shared-platform-core', 'features-editor', 'store-native', 'store']));
});

it('runs every bucket without a part and rejects an unknown part', () => {
  expect(selectSharedTestBuckets('')).toBe(SHARED_TEST_BUCKETS);
  expect(selectSharedTestBuckets(undefined)).toBe(SHARED_TEST_BUCKETS);
  expect(() => selectSharedTestBuckets('three')).toThrow('unknown part');
});
