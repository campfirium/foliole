/* global process */

const ACTION = 'readwise-api-connection';
const ACCEPTANCE_SPEC = 'tests/desktop/t178-2-readwise-api-connection.spec.ts';
const TIMEOUT_MS = 20 * 60_000;

export async function runWindowsReadwiseApiConnectionAcceptance(action, execute, paths) {
  if (action !== ACTION) return null;
  const result = await execute(paths.systemNode, [
    paths.systemNpmCli, 'run', 'test:e2e:desktop:native:hidden', '--', ACCEPTANCE_SPEC
  ], {
    cwd: paths.repoRoot,
    env: { ...process.env, FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: '1' },
    timeoutCode: 'desktop_readwise_api_connection_timeout',
    timeoutMs: TIMEOUT_MS,
    windowsHide: true
  });
  if (result.code !== 0) {
    const detail = result.lines?.at(-1) || result.stderr || 'Readwise API connection acceptance failed';
    throw Object.assign(new Error(String(detail).trim()), {
      exitCode: 74, result, stage: 'desktop-readwise-api-connection'
    });
  }
  return {
    output: result.output,
    readwiseApiConnection: { resultStatus: 'passed', spec: ACCEPTANCE_SPEC }
  };
}
