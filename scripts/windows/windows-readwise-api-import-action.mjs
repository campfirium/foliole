/* global process */

const ACTION = 'readwise-api-import';
const ACCEPTANCE_SPECS = [
  'tests/desktop/t178-4-readwise-api-import.spec.ts',
  'tests/desktop/t178-6-readwise-api-original-file.spec.ts'
];
const TIMEOUT_MS = 20 * 60_000;

export async function runWindowsReadwiseApiImportAcceptance(action, execute, paths) {
  if (action !== ACTION) return null;
  const result = await execute(paths.systemNode, [
    paths.systemNpmCli, 'run', 'test:e2e:desktop:native:hidden', '--', ...ACCEPTANCE_SPECS
  ], {
    cwd: paths.repoRoot,
    env: { ...process.env, FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: '1' },
    timeoutCode: 'desktop_readwise_api_import_timeout',
    timeoutMs: TIMEOUT_MS,
    windowsHide: true
  });
  if (result.code !== 0) {
    const detail = result.lines?.at(-1) || result.stderr || 'Readwise API import acceptance failed';
    throw Object.assign(new Error(String(detail).trim()), {
      exitCode: 74, result, stage: 'desktop-readwise-api-import'
    });
  }
  return {
    output: result.output,
    readwiseApiImport: { resultStatus: 'passed', specs: ACCEPTANCE_SPECS }
  };
}
