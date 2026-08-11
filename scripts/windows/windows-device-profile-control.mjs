import path from 'node:path';

import {
  parseWindowsDevFailureEvidence, parseWindowsDevSuccessEvidence
} from './windows-dev-control-evidence.mjs';

export async function copyWindowsDeviceProfileEvidence(options) {
  if (options.action !== 'device-profile') return null;
  const evidence = options.remoteError
    ? parseWindowsDevFailureEvidence(options.remoteOutput)
    : parseWindowsDevSuccessEvidence(options.remoteOutput);
  const localRoot = path.join(
    options.repoRoot, '.tmp', 'artifacts', 'windows-device-profile', evidence.buildIdentity
  );
  options.fsApi.mkdirSync(localRoot, { recursive: true });
  for (const name of ['action.log', 'summary.json']) {
    await options.copyFile(`${evidence.remoteRoot}/${name}`, path.join(localRoot, name));
  }
  return { evidenceRoot: localRoot, manifestPath: path.join(localRoot, 'summary.json') };
}
