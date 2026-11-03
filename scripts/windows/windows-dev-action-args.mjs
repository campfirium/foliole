import { extractSqliteDiagnosticMode } from './windows-dev-action-contract.mjs';
import { extractCandidateRevision, extractCandidateSourceRef } from './windows-dev-candidate-control.mjs';
import { WINDOWS_DEV_ACTIONS } from './windows-dev-actions.mjs';

// Parse registered actions without choosing a machine; execution supplies its host.
export function parseWindowsDevActionArgs(argv, env = {}) {
  const { args: modeArgs, diagnosticMode } = extractSqliteDiagnosticMode(argv);
  const parsedSource = extractCandidateSourceRef(modeArgs);
  const parsedRevision = extractCandidateRevision(parsedSource.args);
  const args = parsedRevision.args;
  const hostIndex = args.indexOf('--host');
  const host = hostIndex >= 0
    ? args.splice(hostIndex, 2)[1]
    : env.FOLIOLE_WINDOWS_DEV_SSH;
  if ((hostIndex >= 0 || host !== undefined)
      && (!host || !/^[A-Za-z0-9._\\-]+@[A-Za-z0-9.-]+$/u.test(host))) {
    throw new Error('Windows DEV SSH host must use user@host format');
  }
  if (args.length !== 1 || !WINDOWS_DEV_ACTIONS.includes(args[0])) {
    throw new Error(
      'Windows DEV control only accepts a registered fixed action'
    );
  }
  const releaseJourney = args[0] === 'default-sync-journey'
    && ['refs/heads/dev', 'refs/heads/release'].includes(parsedSource.sourceRef);
  if (parsedSource.explicit && args[0] !== 'multi-device-sync-candidate' && !releaseJourney) {
    throw new Error('Windows DEV source ref is only accepted for candidate preparation');
  }
  if (parsedRevision.revision && !['internal-install', 'internal-open'].includes(args[0])) {
    throw new Error('Pinned Windows revision is only accepted for Internal installation and opening');
  }
  return { action: args[0], host, ...(diagnosticMode ? { diagnosticMode } : {}),
    ...(parsedSource.explicit ? { sourceRef: parsedSource.sourceRef } : {}),
    ...(parsedRevision.revision ? { revision: parsedRevision.revision } : {}) };
}
