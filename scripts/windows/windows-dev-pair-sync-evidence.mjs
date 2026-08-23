import path from 'node:path';

import { PAIR_SYNC_RECOVERY_EVIDENCE_FILES } from '../sync-group/pair-sync-feature-contract.mjs';
import {
  pairSyncRecoveryFailureFiles
} from '../sync-group/pair-sync-failure-evidence.mjs';

export const WINDOWS_DEV_PAIR_SYNC_RECOVERY_FILES = [
  ...PAIR_SYNC_RECOVERY_EVIDENCE_FILES, 'summary.json'
];

export async function copyWindowsDevPairSyncRecoveryEvidence({
  copyFile, fsApi, remoteError, remoteRoot, repoRoot
}) {
  const localRoot = path.join(
    repoRoot, '.tmp', 'artifacts', 'a5-pair-sync-recovery', path.basename(remoteRoot)
  );
  fsApi.mkdirSync(localRoot, { recursive: true });
  const names = remoteError ? ['summary.json'] : WINDOWS_DEV_PAIR_SYNC_RECOVERY_FILES;
  for (const name of names) await copyFile(name, localRoot);
  let warning = null;
  if (remoteError) {
    try {
      const summary = JSON.parse(fsApi.readFileSync(path.join(localRoot, 'summary.json'), 'utf8'));
      for (const name of pairSyncRecoveryFailureFiles(summary.pairSyncFailureEvidence)) {
        await copyFile(name, localRoot);
      }
    } catch (error) {
      warning = error.message;
    }
  }
  return { localRoot, warning };
}
