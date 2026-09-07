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

it('uses one fixed signed acceptance container for the task', () => {
  expect(friAcceptanceBundle('t173')).toEqual({
    applicationId: 'com.foliole.ios.t173',
    suffix: '.t173'
  });
  expect(() => friAcceptanceBundle('12345678-1234-4234-8234-123456789abc'))
    .toThrow('task identity');
});
