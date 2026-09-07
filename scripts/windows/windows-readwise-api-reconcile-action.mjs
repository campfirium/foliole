/* global process */

export const WINDOWS_READWISE_API_RECONCILE_ACTION = 'readwise-api-reconcile';
const ACCEPTANCE_SPEC = 'tests/desktop/t178-7-readwise-api-reconcile.spec.ts';
const TIMEOUT_MS = 20 * 60_000;

export async function runWindowsReadwiseApiReconcileAcceptance(action, execute, paths) {
  if (action !== WINDOWS_READWISE_API_RECONCILE_ACTION) return null;
  const result = await execute(paths.systemNode, [
    paths.systemNpmCli, 'run', 'test:e2e:desktop:native:hidden', '--', ACCEPTANCE_SPEC
  ], {
    cwd: paths.repoRoot,
    env: { ...process.env, FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: '1' },
    timeoutCode: 'desktop_readwise_api_reconcile_timeout',
    timeoutMs: TIMEOUT_MS,
    windowsHide: true
  });
  if (result.code !== 0) {
    const detail = result.lines?.at(-1) || result.stderr || 'Readwise API reconciliation acceptance failed';
    throw Object.assign(new Error(String(detail).trim()), {
      exitCode: 74, result, stage: 'desktop-readwise-api-reconcile'
    });
  }
  return { output: result.output, readwiseApiReconcile: { resultStatus: 'passed', spec: ACCEPTANCE_SPEC } };
}
