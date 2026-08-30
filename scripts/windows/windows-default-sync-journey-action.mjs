import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const WINDOWS_DEFAULT_SYNC_JOURNEY_ACTION = 'default-sync-journey';
export const WINDOWS_DEFAULT_SYNC_JOURNEY_SCREENSHOTS = [
  't160-before-workspace.png',
  't160-before-sync.png',
  't160-after-workspace.png',
  't160-after-sync.png'
];

function assertEvidenceFiles(evidenceRoot, fsApi) {
  for (const name of WINDOWS_DEFAULT_SYNC_JOURNEY_SCREENSHOTS) {
    if (!fsApi.existsSync(path.join(evidenceRoot, name))) {
      throw new Error(`Windows default Sync journey did not produce ${name}.`);
    }
  }
}

export async function runWindowsDefaultSyncJourney({ checked, evidenceRoot, execute,
  fsApi = fs, paths }) {
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
  return { output: result.output };
}
