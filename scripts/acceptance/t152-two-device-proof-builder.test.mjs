import { expect, it } from 'vitest';

import { buildT152TwoDeviceProof } from './t152-two-device-proof-builder.mjs';

const raw = (reason, runId) => ({ finished_at: '2026-08-29T00:00:00.000Z',
  reason, run_id: runId, status: 'completed' });

it('builds the full run matrix from host product results', () => {
  const proof = buildT152TwoDeviceProof({ automaticBeforeRestartHost: 'macos',
    builds: { macos: 'a'.repeat(40), windows: 'a'.repeat(40) },
    business: { idempotent: true, twoWayUnion: true },
    conflict: { silentOverwrite: false, visible: true },
    devices: { macos: { identity: 'mac', locator: 'mac-device' },
      windows: { identity: 'win', locator: 'win-device' } },
    failureLocator: '/attempt', groupId: 'group-1', groupTag: 'a'.repeat(32),
    libraries: [{ locator: '/mac' }, { locator: '/win' }], rawRuns: {
      macos: { automaticAfterRestart: raw('automatic', 'ma2'),
        automaticBeforeRestart: raw('automatic', 'ma1'),
        manualAfterRestart: raw('manual', 'mm2'), manualBeforeRestart: raw('manual', 'mm1') },
      windows: { automaticAfterRestart: raw('automatic', 'wa2'),
        initial: raw('initial', 'wi'), manualAfterRestart: raw('manual', 'wm2'),
        manualBeforeRestart: raw('manual', 'wm1') }
    } });
  expect(proof.runs.initial).toMatchObject({ deviceIdentityKey: 'win',
    triggerReason: 'initial' });
  expect(proof.runs.automaticAfterRestart.map(({ deviceIdentityKey }) => deviceIdentityKey))
    .toEqual(['mac', 'win']);
  expect(proof.runs.manualBeforeRestart).toHaveLength(2);
  expect(proof.legacyAbsence.group).toEqual({ absent: true,
    resourceLocators: ['/mac', '/win'] });
});
