// @vitest-environment node

import { expect, it } from 'vitest';

import {
  assertReleaseDesktopSourceBucketCoverage,
  buildReleaseDesktopSourceBuckets,
  collectReleaseDesktopSourceTestFiles
} from './run-release-desktop-source-test-bucket.mjs';

it('splits release desktop source tests into bounded buckets', () => {
  const files = collectReleaseDesktopSourceTestFiles();
  const buckets = buildReleaseDesktopSourceBuckets(files);

  expect(files).toContain('src/startupBootstrap.test.ts');
  expect(files).toContain('src/startupViewMode.test.ts');
  expect(files.some((file) => file.startsWith('src/app/'))).toBe(true);
  expect(files.some((file) => file.startsWith('src/test/'))).toBe(true);
  expect(buckets.length).toBeGreaterThan(1);
  expect(buckets.filter((bucket) => bucket.label.startsWith('app-'))
    .every((bucket) => bucket.targets.length <= 30)).toBe(true);
  expect(buckets.filter((bucket) => bucket.label.startsWith('smoke-'))
    .every((bucket) => bucket.targets.length === 1)).toBe(true);
  expect(buckets.find((bucket) => bucket.label === 'root-01')?.targets).toEqual([
    'src/startupBootstrap.test.ts',
    'src/startupViewMode.test.ts'
  ]);
  expect(() => assertReleaseDesktopSourceBucketCoverage(files, buckets)).not.toThrow();
});

it('rejects missing and duplicate targets', () => {
  const files = ['src/app/first.test.ts', 'src/app/second.test.ts'];

  expect(() => assertReleaseDesktopSourceBucketCoverage(files, [
    { label: 'source-01', targets: [files[0], files[0]] }
  ])).toThrow(/missing: src\/app\/second\.test\.ts[\s\S]*duplicate: src\/app\/first\.test\.ts/u);
});
