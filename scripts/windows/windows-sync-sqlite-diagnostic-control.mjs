import path from 'node:path';
import fs from 'node:fs';

import { parseWindowsDevFailureEvidence, parseWindowsDevSuccessEvidence } from './windows-dev-control-evidence.mjs';

export const SQLITE_DIAGNOSTIC_ACTION = 'sync-sqlite-diagnostic';

export async function runWindowsSyncSqliteDiagnostic({ action, diagnosticMode, execute, paths, evidenceRoot, fsApi = fs }) {
  if (action !== SQLITE_DIAGNOSTIC_ACTION) return null;
  let output = '';
  const run = async (command, args, timeoutMs) => {
    output += `[diagnostic command] ${JSON.stringify(args)}\n`;
    fsApi.writeFileSync(path.join(evidenceRoot, 'action.log'), output);
    try {
      const result = await execute(command, args, { cwd: paths.repoRoot, timeoutMs,
        timeoutCode: 'sqlite_diagnostic_action_timeout', windowsHide: true });
      output += result.output;
      fsApi.writeFileSync(path.join(evidenceRoot, 'action.log'), output);
      if (result.code !== 0) throw Object.assign(new Error('SQLite diagnostic preparation failed'), { result });
    } catch (error) {
      output += error.output ?? error.message;
      fsApi.writeFileSync(path.join(evidenceRoot, 'action.log'), output);
      throw error;
    }
  };
  const root = path.join(evidenceRoot, 'sqlite-diagnostic');
  if (diagnosticMode === 'micro') {
    await run(paths.systemNode, ['--experimental-sqlite', 'scripts/windows/windows-sqlite-commit-micro.mjs', root], 5 * 60_000);
  } else if (diagnosticMode === 'offline') {
    await run(paths.systemNode, ['scripts/windows/windows-electron-offline-prepare.mjs', root], 60_000);
    await run(paths.systemNode, ['scripts/electron-sqlite-runner.mjs', '--preflight'], 60_000);
  } else if (diagnosticMode === 'download') {
    await run(paths.systemNode, ['scripts/windows/windows-electron-download-diagnostic.mjs', root], 95_000);
  } else if (diagnosticMode === 'snapshot') {
    await run(paths.systemNode, ['scripts/windows/windows-sync-sqlite-diagnostic.mjs', root, 'snapshot'], 150_000);
  } else {
    await run(paths.systemNode, ['scripts/electron-sqlite-runner.mjs', '--preflight'], 60_000);
    await run(paths.systemNode, [paths.systemNpmCli, 'run', 'electron:compile'], 5 * 60_000);
    await run(paths.systemNode, ['scripts/windows/windows-sync-sqlite-diagnostic.mjs', root], 85 * 60_000);
  }
  fsApi.writeFileSync(path.join(root, 'preparation.log'), output);
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
