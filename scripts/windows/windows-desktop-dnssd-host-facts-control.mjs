import path from 'node:path';

import {
  parseWindowsDevFailureEvidence, parseWindowsDevSuccessEvidence
} from './windows-dev-control-evidence.mjs';

export async function copyWindowsDesktopDnsSdHostFacts(options) {
  if (options.action !== 'desktop-dnssd-host-facts') return null;
  const evidence = options.remoteError
    ? parseWindowsDevFailureEvidence(options.remoteOutput)
    : parseWindowsDevSuccessEvidence(options.remoteOutput);
  const localRoot = path.join(options.repoRoot, '.tmp', 'artifacts',
    't152-15-host-facts', evidence.buildIdentity);
  options.fsApi.mkdirSync(localRoot, { recursive: true });
  const names = options.remoteError
    ? ['action.log', 'summary.json']
    : ['desktop-dnssd-host-facts.json', 'summary.json'];
  for (const name of names) {
    await options.copyFile(`${evidence.remoteRoot}/${name}`, path.join(localRoot, name));
  }
  return { evidenceRoot: localRoot,
    manifestPath: path.join(localRoot, 'desktop-dnssd-host-facts.json') };
}
