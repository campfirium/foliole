// @vitest-environment node

import fs from 'node:fs';

import { expect, it } from 'vitest';

import { friAcceptanceBundle } from './ios-acceptance-sync-event-projection.mjs';

it('runs the isolated signed projection target and accepts only its fixed fields', () => {
  const source = fs.readFileSync('scripts/ios/ios-acceptance-sync-event-projection.mjs', 'utf8');
  expect(source).toContain('AppAcceptanceProjectionTests/FolioleAcceptanceSyncEventProjectionTests');
  expect(source).toContain('FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundle.suffix');
  expect(source).toContain('value.container_identity !== applicationId');
  expect(source).toContain('FolioleAcceptanceGroupDiscoveryTests/testFindsExpectedSyncGroup');
  expect(source).not.toMatch(/CapacitorDatabase|device copy|container_path|workgroup_key|endpoint/u);
});

it('derives a unique signed acceptance container from the preallocated attempt', () => {
  expect(friAcceptanceBundle('12345678-1234-4234-8234-123456789abc')).toEqual({
    applicationId: 'com.foliole.ios.t152acceptance.a12345678123442348234123456789abc',
    suffix: '.t152acceptance.a12345678123442348234123456789abc'
  });
  expect(() => friAcceptanceBundle('shared')).toThrow('attempt identity');
});
