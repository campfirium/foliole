// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  departedCredentialFixture, departedWorkspaceFixture
} from './android-departed-credential-fixture.mjs';
import { credentialsSignableReadinessFixture } from './macos-a5-credential-handoff-fixture.mjs';
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
  expect(runMacosA5PairSyncPreflight({ adb: '/adb', buildRoot: '/repo' }, run))
    .toMatchObject({ departedCredentialState: 'departed_preserved_history',
      existingPairing: false, joinedEmptyReauthorization: false });
});

it('consumes departed-preserved-history through the existing fresh join only', async () => {
  const runPairSync = vi.fn().mockResolvedValue({
    output: '', pairSyncRecovery: { manifestPath: '/tmp/credentials.json' }
  });
  const collectProtectedReadiness = vi.fn().mockResolvedValue({ ...departedCredentialFixture });
  const leaveJoinedEmpty = vi.fn();
  const produceHandoff = vi.fn();
  const resolveReadiness = vi.fn()
    .mockReturnValueOnce({ ...departedCredentialFixture })
    .mockReturnValueOnce({ ...credentialsSignableReadinessFixture });
  const args = {
    assertFixed: vi.fn(), build: vi.fn(), buildIdentity: () => 'build-departed',
    checked: vi.fn(), env: {}, execute: vi.fn(), paths: {
      artifactsRoot: '/evidence', sourceRepoRoot: '/repo/foliole'
    },
    serial: '87a33a4b'
  };
  await runMacosA5PairCredentialsEntry(args, {
    buildDesktop: vi.fn(), collectProtectedReadiness,
    inspectDesktopDeparture: () => ({
      groupId: 'group-1', remotePeerAuthorizationFingerprint: '82cc2dc5c98135c8',
      timelineId: 'timeline-1'
    }), leaveJoinedEmpty, readReceipt: () => ({ credentials: 'saved_signable',
      initialSync: 'not_started', pairingPath: 'new' }),
    produceHandoff, resolveReadiness, runPairSync
  });

  expect(leaveJoinedEmpty).not.toHaveBeenCalled();
  expect(collectProtectedReadiness).toHaveBeenCalledOnce();
  expect(produceHandoff).toHaveBeenCalledWith(expect.objectContaining({
    artifactsRoot: '/evidence', readiness: credentialsSignableReadinessFixture,
    sourceRepoRoot: '/repo/foliole'
  }));
  expect(runPairSync).toHaveBeenCalledWith(expect.objectContaining({
    evidenceRoot: path.join('/evidence', 'a5-pair-credentials/build-departed'),
    existingPairing: false,
    hostName: 'A5', pairedAuthorizationFingerprint: null, pairRequestIdentity: 'A5',
    protectedSyncGroup: { groupId: 'group-1', timelineId: 'timeline-1' },
    recoveryEvidenceGoal: 'credentials-signable',
    desktopAuthorizationFingerprint: '82cc2dc5c98135c8'
  }));
});
