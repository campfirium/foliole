import path from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  assertFreshCredentialReceipt,
  credentialEvidenceExecute,
  macosA5CredentialsOnlyModeArgs,
  runMacosA5PairCredentialsEntry
} from './macos-a5-pair-credentials-action.mjs';
import {
  assertFreshCredentialRejoinBaseline, assertJoinedEmptyCredentialReauthorization,
  leaveJoinedEmptyCredentialSession
} from './macos-a5-pair-credentials-rejoin.mjs';
import { macosPairSyncIdentityFingerprint } from './macos-pair-sync-desktop-session.mjs';

it('stops fresh A5 pairing after native credentials can sign the first request', async () => {
  const runPairSync = vi.fn().mockResolvedValue({
    output: '', pairSyncRecovery: { manifestPath: '/tmp/credentials.json' }
  });
  const args = {
    assertFixed: vi.fn(), build: vi.fn(), buildIdentity: () => 'build-1', checked: vi.fn(),
    env: {}, execute: vi.fn(), paths: { repoRoot: '/repo/foliole' }, serial: '87a33a4b'
  };
  await runMacosA5PairCredentialsEntry(args, {
    buildDesktop: vi.fn(),
    resolveReadiness: () => ({
      credentialRepairRequired: false, deviceIdentityFingerprint: 'device-1',
      existingPairing: false, pairTargetPeerFingerprint: 'peer-1'
    }),
    runPairSync
  });

  expect(runPairSync).toHaveBeenCalledWith(expect.objectContaining({
    evidenceRoot: path.join('/repo/foliole', '.tmp/artifacts/a5-pair-credentials/build-1'),
    instrumentationModeArgs: macosA5CredentialsOnlyModeArgs,
    recoveryEvidenceGoal: 'credentials-signable', remotePeerFingerprint: 'peer-1'
  }));
  expect(macosA5CredentialsOnlyModeArgs()).toEqual([
    '-e', 'foliolePairSyncEvidenceGoal', 'credentials-signable'
  ]);
  expect(runPairSync.mock.calls[0][0].execute).not.toBe(args.execute);
});

it('bounds only the credential instrumentation wait instead of inheriting full sync timeout', async () => {
  const execute = vi.fn().mockResolvedValue({ code: 0 });
  const bounded = credentialEvidenceExecute(execute, 12_345);
  await bounded('adb', ['shell'], {
    timeoutCode: 'pair_sync_instrumentation_timeout', timeoutMs: 660_000
  });
  await bounded('adb', ['install'], { timeoutCode: 'pair_sync_install_timeout', timeoutMs: 300_000 });

  expect(execute.mock.calls[0][2]).toMatchObject({ timeoutMs: 12_345 });
  expect(execute.mock.calls[1][2]).toMatchObject({ timeoutMs: 300_000 });
});

const digest = 'a'.repeat(64);
const joinedEmpty = {
  activeSyncGroupMemberCount: 3, credentialRepairRequired: false,
  deviceIdentityFingerprint: '2fdd44bb500a5934', dirtyObjectCounts: {}, dirtyRecordCount: 0,
  existingPairing: false, joinedEmptyReauthorization: true, nodeCount: 0,
  pairingCredentialsPresent: false, protectedContentDigest: digest,
  storedSyncGroupId: 'group-1', storedSyncGroupTimelineId: 'timeline-1',
  syncGroupCredentialsPresent: true, syncGroupId: 'group-1',
  syncGroupRemotePeerFingerprint: 'a8ef578b118115cf', syncGroupRoutePresent: true,
  syncGroupTimelineId: 'timeline-1', workgroupKeyPresent: true
};

const departed = {
  ...joinedEmpty, activeSyncGroupMemberCount: 2, existingPairing: false,
  joinedEmptyReauthorization: false, storedSyncGroupId: null, storedSyncGroupTimelineId: null,
  syncGroupCredentialsPresent: false, syncGroupId: null, syncGroupRoutePresent: false,
  syncGroupTimelineId: null, workgroupKeyPresent: false
};

it('routes exact joined-empty credentials through product Leave and a fresh bounded join', async () => {
  const runPairSync = vi.fn().mockResolvedValue({
    output: '', pairSyncRecovery: { manifestPath: '/tmp/credentials.json' }
  });
  const leaveJoinedEmpty = vi.fn().mockResolvedValue({ manifestPath: '/tmp/leave.json' });
  const resolveReadiness = vi.fn().mockReturnValueOnce(joinedEmpty).mockReturnValueOnce(departed);
  const args = {
    assertFixed: vi.fn(), build: vi.fn(), buildIdentity: () => 'build-2', checked: vi.fn(),
    env: {}, execute: vi.fn(), paths: { repoRoot: '/repo/foliole' }, serial: '87a33a4b'
  };
  await runMacosA5PairCredentialsEntry(args, {
    buildDesktop: vi.fn(), leaveJoinedEmpty, readReceipt: () => ({
      credentials: 'saved_signable', initialSync: 'not_started', pairingPath: 'new'
    }), resolveReadiness, runPairSync
  });

  expect(leaveJoinedEmpty).toHaveBeenCalledWith(expect.objectContaining({
    baseline: expect.objectContaining({ groupId: 'group-1', protectedContentDigest: digest }),
    evidenceRoot: path.join('/repo/foliole', '.tmp/artifacts/a5-pair-credentials/build-2/leave')
  }));
  expect(runPairSync).toHaveBeenCalledWith(expect.objectContaining({
    credentialRepairRequired: false, existingPairing: false, pairedDeviceFingerprint: null,
    pairRequestFingerprint: '2fdd44bb500a5934',
    protectedSyncGroup: { groupId: 'group-1', timelineId: 'timeline-1' },
    remotePeerFingerprint: 'a8ef578b118115cf', recoveryEvidenceGoal: 'credentials-signable'
  }));
});

it('rejects any Leave drift or credential receipt that advances initial sync', () => {
  const baseline = assertJoinedEmptyCredentialReauthorization(joinedEmpty);
  expect(assertFreshCredentialRejoinBaseline(departed, baseline)).toBe(departed);
  expect(() => assertFreshCredentialRejoinBaseline({ ...departed, protectedContentDigest: 'b'.repeat(64) }, baseline))
    .toThrow('did not preserve');
  expect(() => assertFreshCredentialReceipt({
    credentials: 'saved_signable', initialSync: 'started', pairingPath: 'new'
  })).toThrow('before initial sync');
});

it('proves the desktop roster and group identity around formal product Leave', async () => {
  const localDeviceId = 'android-a5';
  const remoteDeviceId = 'desktop-mac';
  const offlineDeviceId = 'offline-peer';
  const baseline = { ...assertJoinedEmptyCredentialReauthorization(joinedEmpty),
    deviceIdentityFingerprint: macosPairSyncIdentityFingerprint(localDeviceId),
    remotePeerFingerprint: macosPairSyncIdentityFingerprint(remoteDeviceId) };
  const overview = (members) => ({ paired_devices: [], pending_requests: [], sync_enabled: true,
    server_status: { port: 38641, state: 'running' }, sync_group: {
      group_id: 'group-1', timeline_id: 'timeline-1', members: members.map((device_id) => ({
        device_id, state: 'active'
      }))
    } });
  const session = {
    assertActive: vi.fn(), close: vi.fn().mockResolvedValue(),
    enable: vi.fn().mockResolvedValue(overview([localDeviceId, remoteDeviceId, offlineDeviceId])),
    load: vi.fn().mockResolvedValue(overview([remoteDeviceId, offlineDeviceId])),
    sanitize: vi.fn(() => ({ desktopPeerFingerprint: baseline.remotePeerFingerprint,
      pendingDeviceFingerprints: [] }))
  };
  const maintenance = vi.fn().mockResolvedValue({ manifestPath: '/tmp/leave.json' });
  await leaveJoinedEmptyCredentialSession({ baseline, buildIdentity: 'build-3', env: {},
    evidenceRoot: '/tmp/evidence', execute: vi.fn(), paths: { repoRoot: '/repo' },
    serial: '87a33a4b' }, { maintenance, openSession: async () => session, wait: vi.fn() });

  expect(maintenance).toHaveBeenCalledWith(expect.objectContaining({
    action: 'leave-sync-group', installMain: false
  }));
  expect(session.assertActive).toHaveBeenCalledTimes(2);
  expect(session.close).toHaveBeenCalledOnce();
});
