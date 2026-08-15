import { expect, it, vi } from 'vitest';

import { runMacosA5ExistingSyncPreflight } from './macos-a5-pair-sync-preflight.mjs';

function result(prefix, value, status = 0) {
  return { status, stderr: '', stdout: `${prefix}${JSON.stringify(value)}\n` };
}

function runFor(pairState, workspaceState) {
  return vi.fn()
    .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', pairState))
    .mockReturnValueOnce(result('[android-data] capture-annotation-readiness=', workspaceState));
}

const groupState = {
  activeSyncGroupMemberCount: 3,
  deviceIdentityFingerprint: '2fdd44bb500a5934',
  dirtyRecordCount: 1,
  nodeCount: 1395,
  pairingCredentialsPresent: false,
  pairingCredentialsRejected: true,
  syncGroupCredentialsPresent: true,
  syncGroupId: 'group-1',
  syncGroupPeerConflict: false,
  syncGroupRemotePeerFingerprint: 'a8ef578b118115cf',
  syncGroupTimelineId: 'timeline-1'
};
const workspace = {
  canonicalInbox: { active: true },
  counts: { nodes: 1395 },
  pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: true }
};

it('accepts existing Sync Group authority without legacy pairing credentials', () => {
  expect(runMacosA5ExistingSyncPreflight(
    { adb: '/adb', repoRoot: '/repo' }, runFor(groupState, workspace)
  )).toEqual(groupState);
});

it('rejects ambiguous Sync Group credentials even when legacy pairing exists', () => {
  expect(() => runMacosA5ExistingSyncPreflight(
    { adb: '/adb', repoRoot: '/repo' }, runFor({
      ...groupState, pairingCredentialsPresent: true, syncGroupPeerConflict: true
    }, workspace)
  )).toThrow('authorized existing Sync Group state');
});
