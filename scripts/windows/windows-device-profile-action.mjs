/* global process */

const ACCEPTANCE_SPEC = 'tests/desktop/host-owned-device-profile.spec.ts';
const TIMEOUT_MS = 20 * 60_000;

export async function runWindowsDeviceProfileAcceptance(action, execute, paths) {
  if (action !== 'device-profile') return null;
  const result = await execute(paths.systemNode, [
    paths.systemNpmCli, 'run', 'test:e2e:desktop:native:hidden', '--', ACCEPTANCE_SPEC
  ], {
    cwd: paths.repoRoot,
    env: { ...process.env, FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: '1' },
    timeoutCode: 'desktop_device_profile_timeout',
    timeoutMs: TIMEOUT_MS, windowsHide: true
  });
  if (result.code !== 0) {
    const detail = result.lines?.at(-1) || result.stderr || 'Desktop device profile acceptance failed';
    throw Object.assign(new Error(String(detail).trim()), {
      exitCode: 74, result, stage: 'desktop-device-profile'
    });
  }
  return {
    evidence: { resultStatus: 'passed', spec: ACCEPTANCE_SPEC },
    output: result.output
  };
}
