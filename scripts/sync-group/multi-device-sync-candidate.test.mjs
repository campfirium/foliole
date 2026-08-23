import { expect, it } from 'vitest';

import { acceptanceControllerFiles } from './multi-device-sync-candidate.mjs';

it('freezes the provider lifecycle helpers used by formal sync journeys', () => {
  expect(acceptanceControllerFiles()).toEqual(expect.arrayContaining([
    'electron/sync/desktopSyncGroupCursorCommit.ts',
    'electron/sync/desktopSyncGroupJoin.ts',
    'scripts/android/android-device-snapshot.mjs',
    'scripts/android/macos-pair-sync-desktop-session.mjs',
    'scripts/desktop/sync-group-journey-fact-action.mjs',
    'scripts/sync-group/multi-device-sync-ab-convergence.mjs',
    'scripts/desktop/sync-from-zero-dataset-action.mjs',
    'scripts/sync-group/multi-device-sync-a-rejoin-provider.mjs',
    'scripts/sync-group/multi-device-sync-candidate-preparation.mjs',
    'scripts/sync-group/multi-device-sync-cli.mjs',
    'scripts/sync-group/multi-device-sync-from-zero-evidence.mjs',
    'scripts/sync-group/multi-device-sync-from-zero.mjs',
    'scripts/sync-group/multi-device-sync-macos-channel.mjs',
    'scripts/sync-group/multi-device-sync-nonempty-admission-proof.mjs',
    'scripts/sync-group/multi-device-sync-participation-evidence.mjs',
    'scripts/sync-group/multi-device-sync-three-device-proof.mjs',
    'scripts/sync-group/multi-device-sync-windows-provider.mjs',
    'scripts/sync-group/sync-progress-watchdog.mjs',
    'scripts/sync-group/sync-from-zero-contract.mjs',
    'scripts/sync-group/sync-from-zero-dataset-inspect.mjs',
    'scripts/windows/windows-multi-device-sync-from-zero-action.mjs',
    'scripts/windows/windows-multi-device-sync-c-action.mjs',
    'scripts/sync-group/pair-sync-feature-journey.mjs',
    'scripts/sync-group/pair-sync-transport.mjs',
    'scripts/windows/windows-dev-action.ps1',
    'scripts/windows/windows-dev-candidate-runtime-control.mjs',
    'scripts/windows/windows-dev-remote-spec.mjs',
    'scripts/windows/windows-pair-sync-desktop-readiness.mjs',
    'scripts/windows/windows-client-native-interactive-state.mjs',
    'scripts/windows/windows-sync-group-interactive-action.mjs',
    'scripts/windows/windows-sync-group-runtime-progress.mjs',
    'scripts/windows/windows-sync-group-owned-client-seed.mjs',
    'scripts/windows/windows-sync-group-session-close.mjs'
  ]));
});
