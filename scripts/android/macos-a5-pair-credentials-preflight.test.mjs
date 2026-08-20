import { expect, it, vi } from 'vitest';

import { runMacosA5PairSyncPreflight } from './macos-a5-pair-sync-preflight.mjs';

function result(prefix, value, status) {
  return { status, stderr: '', stdout: `${prefix}${JSON.stringify(value)}\n` };
}

it('marks only the joined-empty missing-pairing shape for bounded reauthorization', () => {
  const pairState = {
    activeSyncGroupMemberCount: 3, deviceIdentityFingerprint: 'bd1d679fbb55b53e',
    dirtyRecordCount: 0, nodeCount: 0, pairingCredentialsPresent: false,
    pairingCredentialsRejected: false, pairingPeerConflict: false, remotePeerFingerprint: null,
    syncGroupCredentialsPresent: true, syncGroupId: 'group-1', syncGroupPeerConflict: false,
    syncGroupRemotePeerFingerprint: '82cc2dc5c98135c8', syncGroupRoutePresent: true,
    syncGroupTimelineId: 'timeline-1', workgroupKeyPresent: true
  };
  const workspace = {
    counts: { content_blobs: 0, node_order: 0, nodes: 0 },
    pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: true }
  };
  const run = vi.fn()
    .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', pairState, 0))
    .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', workspace, 77));

  expect(runMacosA5PairSyncPreflight({ adb: '/adb', repoRoot: '/repo' }, run))
    .toMatchObject({ existingPairing: false, joinedEmptyReauthorization: true });
});
