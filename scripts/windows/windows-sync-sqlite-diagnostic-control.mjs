import path from 'node:path';

import { parseWindowsDevFailureEvidence, parseWindowsDevSuccessEvidence } from './windows-dev-control-evidence.mjs';

export const SQLITE_DIAGNOSTIC_ACTION = 'sync-sqlite-diagnostic';

export async function runWindowsSyncSqliteDiagnostic({ action, execute, paths, evidenceRoot }) {
  if (action !== SQLITE_DIAGNOSTIC_ACTION) return null;
  let output = '';
  const run = async (command, args, timeoutMs) => {
    const result = await execute(command, args, { cwd: paths.repoRoot, timeoutMs,
      timeoutCode: 'sqlite_diagnostic_action_timeout', windowsHide: true });
    output += result.output;
    if (result.code !== 0) throw Object.assign(new Error('SQLite diagnostic preparation failed'), { result });
  };
  await run(paths.systemNode, [paths.systemNpmCli, 'run', 'electron:compile'], 5 * 60_000);
  const root = path.join(evidenceRoot, 'sqlite-diagnostic');
  await run(paths.systemNode, ['scripts/windows/windows-sync-sqlite-diagnostic.mjs', root], 85 * 60_000);
  await run(paths.tarPath, ['-a', '-cf', path.join(evidenceRoot, 'sqlite-diagnostic.zip'), '-C', root, '.'], 60_000);
  return { output };
}

export async function copyWindowsSyncSqliteDiagnostic(options) {
  if (options.action !== SQLITE_DIAGNOSTIC_ACTION) return null;
  const evidence = options.remoteError ? parseWindowsDevFailureEvidence(options.remoteOutput)
    : parseWindowsDevSuccessEvidence(options.remoteOutput);
  const localRoot = path.join(options.repoRoot, '.tmp/artifacts/windows-sqlite-diagnostic', evidence.buildIdentity);
  options.fsApi.mkdirSync(localRoot, { recursive: true });
  for (const name of options.remoteError ? ['summary.json', 'action.log'] : ['summary.json', 'action.log', 'sqlite-diagnostic.zip']) {
    await options.copyFile(`${evidence.remoteRoot}/${name}`, path.join(localRoot, name));
  }
  return { evidenceRoot: localRoot };
}
