// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  departedCredentialFixture, departedWorkspaceFixture
} from './android-departed-credential-fixture.mjs';
import {
  runMacosA5PairCredentialsEntry
} from './macos-a5-pair-credentials-action.mjs';
import { runMacosA5PairSyncPreflight } from './macos-a5-pair-sync-preflight.mjs';

function result(prefix, value, status) {
  return { status, stderr: '', stdout: `${prefix}${JSON.stringify(value)}\n` };
}

it('classifies the retained endpoint Leave fixture before mutation', () => {
  const pairState = { ...departedCredentialFixture };
  delete pairState.departedCredentialState;
  const run = vi.fn()
    .mockReturnValueOnce(result('[android-data] pair-sync-recovery-readiness=', pairState, 0))
    .mockReturnValueOnce(result(
      '[android-data] capture-annotation-readiness=', departedWorkspaceFixture, 77
    ));
  expect(runMacosA5PairSyncPreflight({ adb: '/adb', repoRoot: '/repo' }, run))
    .toMatchObject({ departedCredentialState: 'departed_preserved_history',
      existingPairing: false, joinedEmptyReauthorization: false });
});

it('consumes departed-preserved-history through the existing fresh join only', async () => {
  const runPairSync = vi.fn().mockResolvedValue({
    output: '', pairSyncRecovery: { manifestPath: '/tmp/credentials.json' }
  });
  const collectProtectedReadiness = vi.fn().mockResolvedValue({ ...departedCredentialFixture });
  const leaveJoinedEmpty = vi.fn();
  const args = {
    assertFixed: vi.fn(), build: vi.fn(), buildIdentity: () => 'build-departed',
    checked: vi.fn(), env: {}, execute: vi.fn(), paths: { repoRoot: '/repo/foliole' },
    serial: '87a33a4b'
  };
  await runMacosA5PairCredentialsEntry(args, {
    buildDesktop: vi.fn(), collectProtectedReadiness,
    inspectDesktopDeparture: () => ({
      groupId: 'group-1', remotePeerFingerprint: '82cc2dc5c98135c8', timelineId: 'timeline-1'
    }), leaveJoinedEmpty, readReceipt: () => ({ credentials: 'saved_signable',
      initialSync: 'not_started', pairingPath: 'new' }),
    resolveReadiness: () => ({ ...departedCredentialFixture }), runPairSync
  });

  expect(leaveJoinedEmpty).not.toHaveBeenCalled();
  expect(collectProtectedReadiness).toHaveBeenCalledOnce();
  expect(runPairSync).toHaveBeenCalledWith(expect.objectContaining({
    evidenceRoot: path.join('/repo/foliole', '.tmp/artifacts/a5-pair-credentials/build-departed'),
    existingPairing: false,
    pairRequestFingerprint: departedCredentialFixture.deviceIdentityFingerprint,
    protectedSyncGroup: { groupId: 'group-1', timelineId: 'timeline-1' },
    recoveryEvidenceGoal: 'credentials-signable',
    remotePeerFingerprint: '82cc2dc5c98135c8'
  }));
});
