import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { MACOS_DAILY_DEBUG_ROOT } from '../macos/macos-electron-dev-paths.mjs';

const WORKGROUP_AEAD_CAPABILITY = 'workgroup-aead-v1';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function assertLegacyTransitionRuntime(repoRoot) {
  const desktopMain = path.join(repoRoot, 'dist/electron/main.js');
  const pairedStore = path.join(
    repoRoot, MACOS_DAILY_DEBUG_ROOT, 'user-data', 'companion-paired-devices.bin'
  );
  if (!fs.existsSync(desktopMain) || !fs.existsSync(pairedStore)) {
    throw new Error('T132-3 protected legacy Leave runtime is unavailable.');
  }
  const desktopBytes = fs.readFileSync(desktopMain);
  if (desktopBytes.includes(WORKGROUP_AEAD_CAPABILITY)) {
    throw new Error('T132-3 protected legacy Leave runtime was replaced by the candidate.');
  }
  return {
    desktopMainDigest: digest(desktopBytes),
    encryptedPairedStoreDigest: digest(fs.readFileSync(pairedStore))
  };
}
