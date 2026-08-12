import { expect, it } from 'vitest';

import { acceptanceControllerFiles } from './multi-device-sync-candidate.mjs';

it('freezes the provider lifecycle helpers used by formal sync journeys', () => {
  expect(acceptanceControllerFiles()).toEqual(expect.arrayContaining([
    'scripts/sync-group/multi-device-sync-a-rejoin-provider.mjs',
    'scripts/sync-group/multi-device-sync-windows-provider.mjs',
    'scripts/sync-group/sync-progress-watchdog.mjs'
  ]));
});
