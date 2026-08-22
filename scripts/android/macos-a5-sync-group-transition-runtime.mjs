import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const WORKGROUP_AEAD_CAPABILITY = 'workgroup-aead-v1';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function assertLegacyTransitionRuntime(paths) {
  const desktopMain = path.join(paths.buildRoot, 'dist/electron/main.js');
  const pairedStore = path.join(
    paths.desktopRuntimeRoot, 'user-data', 'companion-paired-devices.bin'
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
