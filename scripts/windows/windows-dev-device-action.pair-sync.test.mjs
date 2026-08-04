// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  runWindowsDevDeviceAction, WINDOWS_DEV_A5_SERIAL, WINDOWS_DEV_ADB_PORT
} from './windows-dev-device-action.mjs';

function result(stdout = '') {
  return { code: 0, lines: stdout.trim() ? [stdout.trim()] : [], output: stdout, stderr: '', stdout };
}

function fixture() {
  return { evidenceRoot: 'C:\\evidence', paths: {
    adbPath: 'C:\\adb.exe', androidSdk: 'C:\\sdk', javaHome: 'C:\\java',
    protectionBackups: 'C:\\backup', repoRoot: 'C:\\repo', signingHome: 'C:\\signing',
    systemNode: 'C:\\node.exe'
  } };
}

it('routes pair recovery through read-only identity gates before fixed mutation', async () => {
  const { evidenceRoot, paths } = fixture();
  const readiness = {
    deviceIdentityFingerprint: '0123456789abcdef', dirtyRecordCount: 0,
    missingPrerequisites: [], nodeCount: 0, pairingCredentialsPresent: false,
    remotePeerFingerprint: null,
    resultStatus: 'ready', schemaVersion: 1
  };
  const execute = vi.fn(async (_command, args) => {
    if (args.includes('devices')) return result(`${WINDOWS_DEV_A5_SERIAL}\tdevice product:A5\n`);
    if (args.includes('get-state')) return result('device\n');
    if (args.some((arg) => String(arg).includes('android-pair-sync-recovery-readiness-runner.mjs'))) {
      return result(`[android-data] pair-sync-recovery-readiness=${JSON.stringify(readiness)}\n`);
    }
    return result('ok\n');
  });
  const inspectPairSyncDesktop = vi.fn(async () => ({ output: '', overview: {} }));
  await expect(runWindowsDevDeviceAction({
    action: 'pair-sync-recover', evidenceRoot, execute, inspectPairSyncDesktop,
    paths, phase: 'readiness'
  })).resolves.toMatchObject({ pairSyncRecoveryReadiness: readiness });
  expect(inspectPairSyncDesktop).toHaveBeenCalledWith(expect.objectContaining({
    deviceFingerprint: readiness.deviceIdentityFingerprint, remotePeerFingerprint: null
  }));
  const runPairSyncRecovery = vi.fn(async () => ({ output: '', pairSyncRecovery: {} }));
  await runWindowsDevDeviceAction({
    action: 'pair-sync-recover', buildIdentity: 'pair-1', evidenceRoot, execute,
    pairSyncRecoveryReadiness: readiness, paths, runPairSyncRecovery
  });
  expect(runPairSyncRecovery).toHaveBeenCalledWith(expect.objectContaining({
    adbPort: WINDOWS_DEV_ADB_PORT, deviceFingerprint: readiness.deviceIdentityFingerprint,
    remotePeerFingerprint: null,
    serial: WINDOWS_DEV_A5_SERIAL
  }));
});
