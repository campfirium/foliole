import { expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  group: vi.fn(), peerId: vi.fn(), peerHost: vi.fn(), probe: vi.fn(),
  stage: vi.fn(), apply: vi.fn(), member: vi.fn()
}));
vi.mock('./syncGroupStore', () => ({ loadCompanionSyncGroup: runtime.group }));
vi.mock('../network/syncGroupPeerIdentity', () => ({
  resolveCompanionSyncPeerId: runtime.peerId,
  resolveCompanionSyncPeerHostName: runtime.peerHost
}));
vi.mock('./syncGroupIdentityRestoreProbe', () => ({
  probeCompanionSyncIdentityRestoreSet: runtime.probe
}));
vi.mock('./syncGroupIdentityRestoreStage', () => ({
  stageCompanionSyncIdentityRestore: runtime.stage
}));
vi.mock('./pack-apply/companionSyncIdentityRestoreApply', () => ({
  applyCompanionSyncIdentityRestore: runtime.apply
}));
vi.mock('../network/companionSyncGroupMemberState', () => ({
  exchangeCompanionSyncGroupMemberState: runtime.member
}));

import { runCompanionSyncIdentityRestoreRound } from './syncGroupIdentityRestoreRound';

function setup() {
  vi.clearAllMocks();
  runtime.group.mockResolvedValue({ group_id: 'group',
    local_device_identity_key: 'phone' });
  runtime.peerId.mockResolvedValue('desktop');
  runtime.peerHost.mockResolvedValue('Mac');
  const probeCleanup = vi.fn();
  const stagedCleanup = vi.fn();
  runtime.probe.mockResolvedValue({ snapshotPath: '/snapshot', cleanup: probeCleanup });
  runtime.stage.mockResolvedValue({ set: { object_count: 3 }, cleanup: stagedCleanup });
  runtime.apply.mockResolvedValue({ applied: true });
  runtime.member.mockResolvedValue({ normalSyncReady: true,
    localExited: false, peerRemoved: false });
  return { probeCleanup, stagedCleanup };
}

it('applies and rechecks member readiness before ordinary sync can resume', async () => {
  const cleanup = setup();
  await expect(runCompanionSyncIdentityRestoreRound('http://peer', 'Phone', 'restore'))
    .resolves.toEqual({ appliedObjects: 3 });
  expect(runtime.probe).toHaveBeenCalledWith({ endpointUrl: 'http://peer',
    groupId: 'group', localDeviceId: 'phone', peerDeviceId: 'desktop',
    restoreId: 'restore' });
  expect(runtime.apply.mock.invocationCallOrder[0]).toBeLessThan(
    runtime.member.mock.invocationCallOrder[0]!);
  expect(cleanup.stagedCleanup).toHaveBeenCalledOnce();
  expect(cleanup.probeCleanup).toHaveBeenCalledOnce();
});

it('stops after restore when member state still forbids ordinary sync', async () => {
  const cleanup = setup();
  runtime.member.mockResolvedValue({ normalSyncReady: false,
    localExited: false, peerRemoved: false });
  await expect(runCompanionSyncIdentityRestoreRound('http://peer', 'Phone', 'restore'))
    .rejects.toThrow('sync_identity_restore_member_state_not_ready');
  expect(cleanup.stagedCleanup).toHaveBeenCalledOnce();
  expect(cleanup.probeCleanup).toHaveBeenCalledOnce();
});
