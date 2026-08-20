import { expect, it, vi } from 'vitest';

import { runMacosA5PairSyncPreflight } from './macos-a5-pair-sync-preflight.mjs';

function result(prefix, value, status) {
  return { status, stderr: '', stdout: `${prefix}${JSON.stringify(value)}\n` };
}

it('re-authorizes an empty A5 through its unique active Sync Group route', () => {
  const peer = '5bcfa87e1e014fdc';
  const run = vi.fn()
    .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', {
      activeSyncGroupMemberCount: 3, deviceIdentityFingerprint: '2fdd44bb500a5934',
      dirtyRecordCount: 0, nodeCount: 0, pairingCredentialsPresent: false,
      pairingPeerConflict: false, remotePeerFingerprint: null,
      syncGroupCredentialsPresent: true, syncGroupId: 'group-1',
      syncGroupPeerConflict: false, syncGroupRemotePeerFingerprint: peer,
      syncGroupRoutePresent: true, syncGroupTimelineId: 'timeline-1'
    }, 0))
    .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', {
      counts: { content_blobs: 0, node_order: 0, nodes: 0 },
      pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: true }
    }, 77));

  expect(runMacosA5PairSyncPreflight({ adb: '/adb', repoRoot: '/repo' }, run)).toMatchObject({
    existingPairing: false, pairTargetPeerFingerprint: null,
    syncGroupRemotePeerFingerprint: peer
  });
});
