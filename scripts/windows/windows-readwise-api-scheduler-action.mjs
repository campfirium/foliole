/* global process */

export const WINDOWS_READWISE_API_SCHEDULER_ACTION = 'readwise-api-scheduler';
const ACCEPTANCE_SPEC = 'tests/desktop/t178-8-readwise-api-scheduler.spec.ts';
const TIMEOUT_MS = 20 * 60_000;

export async function runWindowsReadwiseApiSchedulerAcceptance(action, execute, paths) {
  if (action !== WINDOWS_READWISE_API_SCHEDULER_ACTION) return null;
  const result = await execute(paths.systemNode, [
    paths.systemNpmCli, 'run', 'test:e2e:desktop:native:hidden', '--', ACCEPTANCE_SPEC
  ], {
    cwd: paths.repoRoot,
    env: { ...process.env, FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: '1' },
    timeoutCode: 'desktop_readwise_api_scheduler_timeout',
    timeoutMs: TIMEOUT_MS,
    windowsHide: true
  });
  if (result.code !== 0) {
    const detail = result.lines?.at(-1) || result.stderr || 'Readwise API scheduler acceptance failed';
    throw Object.assign(new Error(String(detail).trim()), {
      exitCode: 74, result, stage: 'desktop-readwise-api-scheduler'
    });
  }
  return { output: result.output, readwiseApiScheduler: { resultStatus: 'passed', spec: ACCEPTANCE_SPEC } };
}
