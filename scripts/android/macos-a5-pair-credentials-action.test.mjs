// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  departedCredentialFixture, joinedEmptyCredentialFixture
} from './android-departed-credential-fixture.mjs';
import {
  credentialEvidenceExecute,
  macosA5CredentialsOnlyModeArgs,
  runMacosA5PairCredentialsEntry
} from './macos-a5-pair-credentials-action.mjs';

it('stops fresh A5 pairing after native credentials can sign the first request', async () => {
  const runPairSync = vi.fn().mockResolvedValue({
    output: '', pairSyncRecovery: { manifestPath: '/tmp/credentials.json' }
  });
  const args = {
    assertFixed: vi.fn(), build: vi.fn(), buildIdentity: () => 'build-1', checked: vi.fn(),
    env: {}, execute: vi.fn().mockResolvedValue({ code: 0 }), paths: {
      adb: '/adb', artifactsRoot: '/evidence', desktopDevLibrary: '/library',
      sourceRepoRoot: '/repo/foliole'
    }, serial: '87a33a4b'
  };
  await runMacosA5PairCredentialsEntry(args, {
    buildDesktop: vi.fn(),
    readReceipt: () => ({
      credentials: 'saved_signable', initialSync: 'not_started', pairingPath: 'new'
    }),
    resolveReadiness: () => ({
      credentialRepairRequired: false, existingPairing: false, hostName: 'A5',
      pairTargetAuthorizationFingerprint: 'peer-1'
    }),
    runPairSync
  });

  expect(runPairSync).toHaveBeenCalledWith(expect.objectContaining({
    approvalRequired: true,
    credentialRepairRequired: true,
    evidenceRoot: path.join('/evidence', 'a5-pair-credentials/build-1'),
    instrumentationModeArgs: macosA5CredentialsOnlyModeArgs,
    desktopAuthorizationFingerprint: 'peer-1', recoveryEvidenceGoal: 'credentials-signable'
  }));
  expect(macosA5CredentialsOnlyModeArgs()).toEqual([
    '-e', 'foliolePairSyncEvidenceGoal', 'credentials-signable',
    '-e', 'foliolePairSyncTimeoutMs', '120000'
  ]);
  expect(macosA5CredentialsOnlyModeArgs(true)).toContain('re-pair');
  expect(runPairSync.mock.calls[0][0].execute).not.toBe(args.execute);
  expect(args.execute).toHaveBeenCalledWith('/adb', [
    '-s', '87a33a4b', 'shell', 'am', 'force-stop', 'com.foliole.android'
  ], expect.objectContaining({ timeoutCode: 'credential_snapshot_stop_timeout' }));
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
const joinedEmpty = joinedEmptyCredentialFixture;
const departed = departedCredentialFixture;

function withoutProtectedSnapshot(readiness) {
  const preflight = { ...readiness };
  delete preflight.dirtyObjectCounts;
  delete preflight.protectedContentDigest;
  return preflight;
}

it('routes exact joined-empty credentials through product Leave and a fresh bounded join', async () => {
  const runPairSync = vi.fn().mockResolvedValue({
    output: '', pairSyncRecovery: { manifestPath: '/tmp/credentials.json' }
  });
  const leaveJoinedEmpty = vi.fn().mockResolvedValue({ manifestPath: '/tmp/leave.json' });
  const resolveReadiness = vi.fn()
    .mockReturnValueOnce(withoutProtectedSnapshot(joinedEmpty))
    .mockReturnValueOnce(withoutProtectedSnapshot(departed));
  const collectProtectedReadiness = vi.fn(async (readiness) => ({
    ...readiness, dirtyObjectCounts: {}, protectedContentDigest: digest
  }));
  const args = {
    assertFixed: vi.fn(), build: vi.fn(), buildIdentity: () => 'build-2', checked: vi.fn(),
    env: {}, execute: vi.fn().mockResolvedValue({ code: 0 }), paths: {
      adb: '/adb', artifactsRoot: '/evidence', desktopDevLibrary: '/library',
      sourceRepoRoot: '/repo/foliole'
    }, serial: '87a33a4b'
  };
  await runMacosA5PairCredentialsEntry(args, {
    buildDesktop: vi.fn(), collectProtectedReadiness,
    inspectDesktopDeparture: () => ({ groupId: 'group-1',
      remotePeerAuthorizationFingerprint: joinedEmpty.syncGroupRemotePeerFingerprint,
      timelineId: 'timeline-1' }),
    leaveJoinedEmpty, readReceipt: () => ({
      credentials: 'saved_signable', initialSync: 'not_started', pairingPath: 'new'
    }), resolveReadiness, runPairSync
  });

  expect(leaveJoinedEmpty).toHaveBeenCalledWith(expect.objectContaining({
    baseline: expect.objectContaining({ groupId: 'group-1', protectedContentDigest: digest }),
    evidenceRoot: path.join('/evidence', 'a5-pair-credentials/build-2/leave')
  }));
  expect(runPairSync).toHaveBeenCalledWith(expect.objectContaining({
    approvalRequired: true, credentialRepairRequired: true, existingPairing: false, hostName: 'A5',
    pairedAuthorizationFingerprint: null, pairRequestIdentity: 'A5',
    protectedSyncGroup: { groupId: 'group-1', timelineId: 'timeline-1' },
    desktopAuthorizationFingerprint: joinedEmpty.syncGroupRemotePeerFingerprint,
    recoveryEvidenceGoal: 'credentials-signable'
  }));
  expect(collectProtectedReadiness).toHaveBeenCalledTimes(2);
});
