import { expect, it, vi } from 'vitest';

import { runMacosA5PairSyncPreflight } from './macos-a5-pair-sync-preflight.mjs';

function result(prefix, value, status = 0) {
  return { status, stderr: '', stdout: `${prefix}${JSON.stringify(value)}\n` };
}

const pending = {
  activeSyncGroupMemberCount: 3,
  localMemberAuthorizationFingerprint: '2fdd44bb500a5934',
  dirtyObjectCounts: { setting: 3 },
  dirtyRecordCount: 3,
  missingPrerequisites: ['unsynced_device_data_requires_review'],
  nodeCount: 1960,
  pairingCredentialsPresent: false,
  pairingCredentialsRejected: false,
  pairingPeerConflict: false,
  pairingPeerAuthorizationFingerprint: null,
  resultStatus: 'approval_required',
  schemaVersion: 1,
  storedSyncGroupId: 'group-1',
  storedSyncGroupTimelineId: 'timeline-1',
  syncGroupCredentialsPresent: true,
  syncGroupId: 'group-1',
  syncGroupPeerConflict: true,
  syncGroupRoutePresent: true,
  syncGroupTimelineId: 'timeline-1',
  workgroupKeyPresent: true
};
const workspace = {
  canonicalInbox: { active: true, kind: 'folder' },
  counts: { content_blobs: 2415, node_order: 0, nodes: 1960 },
  pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: true }
};

function runFor(pairState, workspaceState = workspace) {
  return vi.fn()
    .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', pairState, 77))
    .mockReturnValueOnce(result(
      '[android-data] capture-annotation-readiness=', workspaceState, 77
    ));
}

it('admits protected migration dirtiness without requiring one legacy pair peer', () => {
  expect(runMacosA5PairSyncPreflight(
    { adb: '/adb', buildRoot: '/repo' }, runFor(pending)
  )).toMatchObject({
    dirtyRecordCount: 3, existingPairing: true, protectedPendingSync: true
  });
});

it('fails closed when migration dirtiness is not completely classified', () => {
  expect(() => runMacosA5PairSyncPreflight(
    { adb: '/adb', buildRoot: '/repo' }, runFor({
      ...pending, dirtyObjectCounts: { setting: 2 }
    })
  )).toThrow('authorized pair-switch state');
});

it('routes a protected upgraded member without pairing credentials through repair', () => {
  const pairState = {
    ...pending,
    pairingPeerConflict: false,
    syncGroupPeerConflict: false,
    syncGroupRemotePeerFingerprint: '5bcfa87e1e014fdc'
  };
  const workspaceState = {
    ...workspace,
    pairingWorkspace: {
      ...workspace.pairingWorkspace,
      syncEndpointPresent: false
    }
  };

  expect(runMacosA5PairSyncPreflight(
    { adb: '/adb', buildRoot: '/repo' }, runFor(pairState, workspaceState)
  )).toMatchObject({
    credentialRepairRequired: true,
    existingPairing: true,
    pairTargetAuthorizationFingerprint: '5bcfa87e1e014fdc',
    protectedPendingSync: true
  });
});
