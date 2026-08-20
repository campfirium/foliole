import { expect, it, vi } from 'vitest';

import { runMacosA5PairSync } from './macos-a5-pair-sync-action.mjs';

function session() {
  return {
    assertActive: vi.fn(),
    remove: vi.fn(),
    sanitize: vi.fn(() => ({
      desktopPeerFingerprint: 'a8ef578b118115cf',
      pairedDeviceFingerprints: ['2fdd44bb500a5934'],
      pendingDeviceFingerprints: [], serverState: 'running', syncEnabled: true
    }))
  };
}

const overview = {
  paired_devices: [{ device_id: 'a5-device' }],
  pending_requests: [],
  sync_group: {
    group_id: 'group-1',
    timeline_id: 'timeline-1',
    members: [{ device_id: 'a5-device', state: 'active' }]
  }
};

it('requires the locked desktop library to expose the protected A5 group identity', async () => {
  const action = await runMacosA5PairSync({
    buildIdentity: 'pending-sync', deviceFingerprint: '2fdd44bb500a5934',
    env: {}, evidenceRoot: '.tmp/artifacts/test-a5-pending-sync', execute: vi.fn(),
    existingPairing: true, paths: { adb: '/adb', repoRoot: '/repo' },
    protectedSyncGroup: { groupId: 'group-2', timelineId: 'timeline-1' },
    runPairSyncRecovery: vi.fn(async (options) => options), serial: 'fixed-a5'
  });
  await expect(action.validateDesktop(
    overview, session(), '2fdd44bb500a5934', null, true, false
  )).rejects.toThrow('Sync Group identity requires user review');
});
