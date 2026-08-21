import { expect, it, vi } from 'vitest';

import { runMacosA5PairSync } from './macos-a5-pair-sync-action.mjs';

function session() {
  return {
    assertActive: vi.fn(),
    sanitize: vi.fn(() => ({
      localAuthorizationFingerprint: 'a8ef578b118115cf',
      pairedAuthorizationFingerprints: ['2fdd44bb500a5934'],
      pendingAuthorizationFingerprints: [], serverState: 'running', syncEnabled: true
    }))
  };
}

const overview = {
  paired_authorizations: [{ authorization_id: 'authorization-a5', host_name: 'A5' }],
  pending_requests: [],
  server_status: { port: 38641, state: 'running' },
  sync_enabled: true,
  sync_group: {
    group_id: 'group-1',
    timeline_id: 'timeline-1',
    local_host_name: 'Mac',
    members: [
      { authorization_id: 'authorization-a5', host_name: 'A5', state: 'active' },
      { authorization_id: 'authorization-mac', host_name: 'Mac', state: 'active' }
    ]
  }
};

it('requires the locked desktop library to expose the protected A5 group identity', async () => {
  const action = await runMacosA5PairSync({
    buildIdentity: 'pending-sync', desktopAuthorizationFingerprint: 'a8ef578b118115cf',
    env: {}, evidenceRoot: '.tmp/artifacts/test-a5-pending-sync', execute: vi.fn(),
    existingPairing: true, hostName: 'A5', paths: { adb: '/adb', repoRoot: '/repo' },
    protectedSyncGroup: { groupId: 'group-2', timelineId: 'timeline-1' },
    runPairSyncRecovery: vi.fn(async (options) => options), serial: 'fixed-a5'
  });
  await expect(action.validateDesktop(
    overview, session(), 'A5', 'a8ef578b118115cf', true, false
  )).rejects.toThrow('Sync Group identity requires user review');
});
