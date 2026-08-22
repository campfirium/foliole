// @vitest-environment node

import { expect, it } from 'vitest';

import { assertRegisteredMacosA5Action } from './macos-a5-action-registry.mjs';

it('keeps build and status outside the fixed A5 mutation lease', () => {
  expect(assertRegisteredMacosA5Action('build')).toMatchObject({
    deviceLeaseMode: null, mutatesFixedA5: false
  });
  expect(assertRegisteredMacosA5Action('status')).toMatchObject({
    deviceLeaseMode: 'readonly-lifecycle', mutatesFixedA5: false
  });
});

it.each([
  'capture-annotation', 'clear-app-data', 'database-performance', 'deploy',
  'device-profile', 'leave-sync-group', 'pair-credentials', 'pair-sync',
  'sync-existing', 'sync-group-rejoin', 'sync-group-rejoin-recover',
  'sync-group-stopped-status'
])('requires the fixed A5 mutation lease for %s', (action) => {
  expect(assertRegisteredMacosA5Action(action)).toMatchObject({
    deviceLeaseMode: 'mutation', mutatesFixedA5: true
  });
});
