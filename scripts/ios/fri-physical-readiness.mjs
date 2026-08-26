import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export const FRI_COREDEVICE_ID = 'CB302BF0-6B5B-5737-8DA8-21F8081E19E7';
export const FRI_UDID = '00008110-001109A802A0401E';
const PROBE_ROOT = '/Users/roamer/P/sys/FriXCUITestProbe';
const RUNNER = '/Users/roamer/.codex/skills/ios-physical-acceptance/scripts/run-fri-xcuitest.sh';

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
    if (!/unlockedSinceBoot: true/u.test(lock)) {
      throw blocked('Fri has not been unlocked since boot.', 'fri_unlock_required', 'fri_details_ready');
    }
    const devices = await execute('xcrun', ['xctrace', 'list', 'devices']);
    if (!devices.includes(FRI_UDID)) {
      throw blocked('Xcode does not expose fixed Fri.', 'fri_xcode_destination_missing', 'fri_lock_ready');
    }
    return { facts: ['fri_paired', 'fri_developer_mode_ready', 'fri_wired',
      'fri_unlocked_since_boot', 'fri_xcode_destination_ready'] };
  };
}

export async function runFriControlPlaneProbe({ artifactRoot, execute = bounded } = {}) {
  const output = await execute(RUNNER, ['--project', path.join(PROBE_ROOT,
    'FriXCUITestProbe.xcodeproj'), '--scheme', 'FriXCUITestProbe',
    '--artifacts-dir', artifactRoot], { cwd: PROBE_ROOT, timeout: 10 * 60_000 });
  return { facts: ['fri_xcuitest_control_plane_ready'], output };
}
