import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const WINDOWS_DEFAULT_SYNC_JOURNEY_ACTION = 'default-sync-journey';
export const WINDOWS_DEFAULT_SYNC_JOURNEY_RECEIPT = 'default-sync-journey-receipt.json';
export const WINDOWS_DEFAULT_SYNC_JOURNEY_SCREENSHOTS = [
  't160-before-workspace.png',
  't160-before-sync.png',
  't160-after-workspace.png',
  't160-after-sync.png'
];

function sourceRevision(result) {
  const revision = result.stdout.trim();
  if (!/^[0-9a-f]{40}$/u.test(revision)) {
    throw new Error('Windows default Sync journey did not resolve a Git source revision.');
  }
  return revision;
}

function assertEvidenceFiles(evidenceRoot, fsApi) {
  for (const name of WINDOWS_DEFAULT_SYNC_JOURNEY_SCREENSHOTS) {
    if (!fsApi.existsSync(path.join(evidenceRoot, name))) {
      throw new Error(`Windows default Sync journey did not produce ${name}.`);
    }
  }
}

export async function runWindowsDefaultSyncJourney({ checked, evidenceRoot, execute,
  fsApi = fs, paths }) {
  const revisionResult = await checked(execute, paths.gitPath,
    ['-C', paths.repoRoot, 'rev-parse', 'HEAD'], {
      cwd: paths.repoRoot, timeoutCode: 'source_revision_timeout', timeoutMs: 30_000,
      windowsHide: true
    }, 'source-revision');
  const revision = sourceRevision(revisionResult);
  const runner = path.join(paths.repoRoot, 'scripts', 'desktop',
    'playwright-desktop-native-hidden.mjs');
  const spec = 'tests/desktop/t160-windows-default-sync-journey.spec.ts';
  const result = await checked(execute, paths.systemNode, [runner, spec], {
    cwd: paths.repoRoot,
    env: {
      ...process.env,
      FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: '1',
      FOLIOLE_T160_EVIDENCE_ROOT: evidenceRoot
    },
    timeoutCode: 'default_sync_journey_timeout', timeoutMs: 30 * 60_000,
    windowsHide: true
  }, 'native-hidden');
  assertEvidenceFiles(evidenceRoot, fsApi);
  const manifestPath = path.join(evidenceRoot, WINDOWS_DEFAULT_SYNC_JOURNEY_RECEIPT);
  fsApi.writeFileSync(manifestPath, `${JSON.stringify({
    action: WINDOWS_DEFAULT_SYNC_JOURNEY_ACTION,
    completedAt: new Date().toISOString(),
    resultStatus: 'success',
    schemaVersion: 1,
    sourceRevision: revision
  }, null, 2)}\n`, 'utf8');
  return {
    defaultSyncJourney: { manifestPath, sourceRevision: revision },
    output: result.output
  };
}
