import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export const FRI_COREDEVICE_ID = 'CB302BF0-6B5B-5737-8DA8-21F8081E19E7';
export const FRI_UDID = '00008110-001109A802A0401E';
const PROBE_ROOT = '/Users/roamer/P/sys/FriXCUITestProbe';
const PROBE_APP_ID = 'com.chenyaopeng.FriXCUITestProbe';
const PREPARED_MARKER = 'prepared.json';
const FRI_XCUITEST_TIMEOUT_MS = 2 * 60_000;

async function bounded(command, args, options = {}) {
  const result = await exec(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    timeout: 20_000, ...options });
  return `${result.stdout}${result.stderr}`;
}

function blocked(message, missingFact, lastSuccessfulAction) {
  return Object.assign(new Error(message), { lastSuccessfulAction, missingFact });
}

export function createFriPhysicalReadinessAdapter({ execute = bounded } = {}) {
  return async () => {
    const details = await execute('xcrun', ['devicectl', 'device', 'info', 'details',
      '--device', FRI_COREDEVICE_ID]);
    for (const [pattern, fact] of [
      [/name: Fri/u, 'fri_name_mismatch'], [/deviceType: iPhone/u, 'fri_not_iphone'],
      [/pairingState: paired/u, 'fri_not_paired'],
      [/developerModeStatus: enabled/u, 'fri_developer_mode_disabled'],
      [/transportType: wired/u, 'fri_not_wired']
    ]) if (!pattern.test(details)) throw blocked('Fixed Fri is not ready.', fact, 'fri_details_read');
    const lock = await execute('xcrun', ['devicectl', 'device', 'info', 'lockState',
      '--device', FRI_COREDEVICE_ID]);
    if (!/passcodeRequired: false/u.test(lock)) {
      throw blocked('Fri is currently locked.', 'fri_current_unlock_required', 'fri_details_ready');
    }
    const devices = await execute('xcrun', ['xctrace', 'list', 'devices']);
    if (!devices.includes(FRI_UDID)) {
      throw blocked('Xcode does not expose fixed Fri.', 'fri_xcode_destination_missing', 'fri_lock_ready');
    }
    return { facts: ['fri_paired', 'fri_developer_mode_ready', 'fri_wired',
      'fri_currently_unlocked', 'fri_xcode_destination_ready'] };
  };
}

export async function prepareFriControlPlaneProbe({ cacheRoot, execute = bounded,
  fsApi = fs } = {}) {
  fsApi.mkdirSync(cacheRoot, { recursive: true });
  const project = path.join(PROBE_ROOT, 'FriXCUITestProbe.xcodeproj');
  const output = await execute('xcodebuild', ['build-for-testing', '-project', project,
    '-scheme', 'FriXCUITestProbe', '-destination', `platform=iOS,id=${FRI_UDID}`,
    '-destination-timeout', '5', '-derivedDataPath', cacheRoot,
    '-allowProvisioningUpdates', '-allowProvisioningDeviceRegistration'], {
    cwd: PROBE_ROOT, timeout: 5 * 60_000
  });
  fsApi.writeFileSync(path.join(cacheRoot, PREPARED_MARKER), `${JSON.stringify({
    preparedAt: new Date().toISOString(), schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  return { output, status: 'prepared' };
}

export async function runFriControlPlaneProbe({ artifactRoot, execute = bounded,
  fsApi = fs, cacheRoot } = {}) {
  fsApi.mkdirSync(artifactRoot, { recursive: true });
  const evidencePath = path.join(artifactRoot, 'fri-control-plane.log');
  if (!fsApi.existsSync(path.join(cacheRoot, PREPARED_MARKER))) {
    return { evidencePath: null, lastSuccessfulAction: 'fri_xcode_destination_ready',
      missingFact: 'fri_control_plane_not_prepared', status: 'blocked' };
  }
  const project = path.join(PROBE_ROOT, 'FriXCUITestProbe.xcodeproj');
  const args = ['test-without-building', '-project', project, '-scheme', 'FriXCUITestProbe',
    '-destination', `platform=iOS,id=${FRI_UDID}`, '-destination-timeout', '5',
    '-derivedDataPath', cacheRoot,
    '-resultBundlePath', path.join(artifactRoot, 'fri-control-plane.xcresult'),
    '-allowProvisioningUpdates'];
  try {
    const testOutput = await execute('xcodebuild', args, {
      cwd: PROBE_ROOT, timeout: FRI_XCUITEST_TIMEOUT_MS
    });
    const launchOutput = await execute('xcrun', ['devicectl', 'device', 'process', 'launch',
      '--device', FRI_COREDEVICE_ID, '--terminate-existing', '--timeout', '30', PROBE_APP_ID], {
      cwd: PROBE_ROOT, timeout: 40_000
    });
    const output = `${testOutput}${launchOutput}`;
    fsApi.writeFileSync(evidencePath, output, 'utf8');
    return { facts: ['fri_xcuitest_control_plane_ready', 'fri_idle_timer_guard_foreground'],
      output, status: 'passed' };
  } catch (error) {
    const detail = `${error.stdout || ''}${error.stderr || ''}${error.message || ''}`;
    fsApi.writeFileSync(evidencePath, detail, 'utf8');
    const locked = /Unlock Fri to Continue/u.test(detail);
    return { evidencePath,
      lastSuccessfulAction: 'fri_xcode_destination_ready',
      missingFact: locked ? 'fri_current_unlock_required' : 'fri_xcuitest_control_plane_failed',
      status: 'blocked' };
  }
}
