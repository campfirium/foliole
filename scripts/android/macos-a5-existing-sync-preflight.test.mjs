import path from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  inspectMacosA5SyncGroupFacts, runMacosA5ExistingSyncPreflight
} from './macos-a5-pair-sync-preflight.mjs';

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
  localMemberAuthorizationFingerprint: '2fdd44bb500a5934',
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

it('uses the current-model inspection against the same library the scenario will open', () => {
  const ready = { resultStatus: 'ready', differences: [], syncGroupId: 'group-1' };
  const run = vi.fn().mockReturnValue(result('[android-data] existing-sync-readiness=', ready));
  expect(runMacosA5ExistingSyncPreflight({ adb: '/adb', buildRoot: '/repo', desktopDevLibrary: '/library' }, run))
    .toEqual(ready);
  expect(run.mock.calls[0][1]).toEqual([path.join('/repo', 'scripts/android/macos-a5-existing-sync-readiness-runner.mjs'),
    '/adb', path.join('/library', 'Data', 'foliole.db')]);
});

it('rejects unapproved content differences', () => {
  const run = vi.fn().mockReturnValue(result('[android-data] existing-sync-readiness=',
    { resultStatus: 'approval_required' }, 77));
  expect(() => runMacosA5ExistingSyncPreflight({ adb: '/adb', buildRoot: '/repo', desktopDevLibrary: '/library' }, run))
    .toThrow('content differences require review');
});

it('reads protected Sync Group facts without treating a missing secure key as authority', () => {
  const recovery = {
    ...groupState, syncGroupCredentialsPresent: false, syncGroupRemotePeerFingerprint: null
  };
  expect(inspectMacosA5SyncGroupFacts(
    { adb: '/adb', buildRoot: '/repo' }, runFor(recovery, workspace)
  )).toEqual(recovery);
});

it('rejects facts when the protected workspace no longer matches', () => {
  expect(() => inspectMacosA5SyncGroupFacts(
    { adb: '/adb', buildRoot: '/repo' }, runFor(groupState, {
      ...workspace, counts: { nodes: 1394 }
    })
  )).toThrow('protected Sync Group workspace');
});
