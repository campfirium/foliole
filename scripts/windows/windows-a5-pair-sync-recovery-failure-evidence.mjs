import path from 'node:path';

import { captureWindowsA5Screenshot } from './windows-a5-screenshot.mjs';

export const PAIR_SYNC_FAILURE_SCREENSHOT = 'pair-sync-recovery-failure.png';
export const PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW =
  'pair-sync-recovery-failure-desktop-overview.json';

export function sanitizePairSyncRecoveryFailureEvidence(value) {
  return {
    ...(value?.screenshot === PAIR_SYNC_FAILURE_SCREENSHOT
      ? { screenshot: PAIR_SYNC_FAILURE_SCREENSHOT } : {}),
    ...(value?.desktopOverview === PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW
      ? { desktopOverview: PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW } : {})
  };
}

export function pairSyncRecoveryFailureFiles(value) {
  return Object.values(sanitizePairSyncRecoveryFailureEvidence(value));
}

function writeJson(fsApi, filePath, value) {
  fsApi.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function collectPairSyncRecoveryFailureEvidence({
  adbPort, env, evidenceRoot, execute, fsApi, paths, serial, session
}) {
  const evidence = {};
  try {
    await captureWindowsA5Screenshot({
      adbPort, env, evidenceRoot, execute, fileName: PAIR_SYNC_FAILURE_SCREENSHOT, fsApi,
      paths, remotePath: '/sdcard/Download/foliole-pair-sync-failure.png', serial,
      stage: 'pair-sync-failure-screenshot'
    });
    evidence.screenshot = PAIR_SYNC_FAILURE_SCREENSHOT;
  } catch { /* Preserve the pairing failure when screenshot capture is unavailable. */ }
  try {
    if (session) {
      const overview = session.sanitize(await session.load());
      writeJson(fsApi, path.join(evidenceRoot, PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW), overview);
      evidence.desktopOverview = PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW;
    }
  } catch { /* Preserve the pairing failure when the desktop overview is unavailable. */ }
  return evidence;
}
