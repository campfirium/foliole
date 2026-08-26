import path from 'node:path';

import {
  parseWindowsDevFailureEvidence, parseWindowsDevSuccessEvidence
} from './windows-dev-control-evidence.mjs';

export async function copyWindowsSyncGroupJoinPrepareEvidence(options) {
  if (options.action !== 'sync-group-join-prepare') return null;
  const evidence = options.remoteError
    ? parseWindowsDevFailureEvidence(options.remoteOutput)
    : parseWindowsDevSuccessEvidence(options.remoteOutput);
  const localRoot = path.join(options.repoRoot, '.tmp', 'artifacts',
    'windows-sync-group-join-prepare', evidence.buildIdentity);
  options.fsApi.mkdirSync(localRoot, { recursive: true });
  const names = options.remoteError ? ['action.log', 'summary.json'] : [
    'action.log', 'summary.json', 'sync-group-join-prepare-receipt.json',
    'sync-group-join-prepare.png'
  ];
  for (const name of names) {
    await options.copyFile(`${evidence.remoteRoot}/${name}`, path.join(localRoot, name));
  }
  return { evidenceRoot: localRoot,
    manifestPath: path.join(localRoot, 'sync-group-join-prepare-receipt.json') };
}
