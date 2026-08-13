import { expect, it } from 'vitest';

import { acceptanceControllerFiles } from './multi-device-sync-candidate.mjs';

it('freezes the provider lifecycle helpers used by formal sync journeys', () => {
  expect(acceptanceControllerFiles()).toEqual(expect.arrayContaining([
    'scripts/android/android-device-snapshot.mjs',
    'scripts/desktop/sync-from-zero-dataset-action.mjs',
    'scripts/sync-group/multi-device-sync-a-rejoin-provider.mjs',
    'scripts/sync-group/multi-device-sync-candidate-preparation.mjs',
    'scripts/sync-group/multi-device-sync-from-zero-evidence.mjs',
    'scripts/sync-group/multi-device-sync-from-zero.mjs',
    'scripts/sync-group/multi-device-sync-participation-evidence.mjs',
    'scripts/sync-group/multi-device-sync-windows-provider.mjs',
    'scripts/sync-group/sync-progress-watchdog.mjs',
    'scripts/sync-group/sync-from-zero-contract.mjs',
    'scripts/sync-group/sync-from-zero-dataset-inspect.mjs',
    'scripts/windows/windows-multi-device-sync-from-zero-action.mjs'
  ]));
});
