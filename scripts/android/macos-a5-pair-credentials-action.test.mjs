import path from 'node:path';

import { expect, it, vi } from 'vitest';

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
