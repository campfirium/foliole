/* global process */

import path from 'node:path';

export function createMacosA5CaptureIdentity() {
  const timestamp = new Date().toISOString().replace(/\D/gu, '').slice(0, 17);
  return `${timestamp}-mac-a5`;
}

export function runMacosA5CaptureReadiness(checked, paths, serial, appId) {
  checked(process.execPath, [
    path.join(paths.buildRoot, 'scripts/android/android-capture-annotation-readiness-runner.mjs'),
    '--adb', paths.adb, '--serial', serial, '--app-id', appId
  ], { cwd: paths.buildRoot });
}

export function runMacosA5PairingReadiness(checked, paths, serial, appId) {
  checked(process.execPath, [
    path.join(paths.buildRoot, 'scripts/android/android-pair-sync-recovery-readiness-runner.mjs'),
    '--adb', paths.adb, '--serial', serial, '--app-id', appId
  ], { cwd: paths.buildRoot });
}
