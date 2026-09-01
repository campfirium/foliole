/* global process */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { signAsync } from '@electron/osx-sign';

const DEV_BUNDLE_ID = 'com.campfirium.foliole.dev';
const DEV_BUNDLE_NAME = 'Foliole DEV';
const DEV_SIGNING_IDENTITY = 'Developer ID Application: CAMPFIRIUM LTD (V589TQH334)';

function runChecked(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe' });
  if (result.status === 0) return result;
  const detail = result.stderr?.trim() || result.error?.message || `exit ${result.status}`;
  throw new Error(`macOS Electron DEV signing failed: ${detail}`);
}

function readPlistValue(infoPlist, key, run) {
  return run('/usr/bin/plutil', [
    '-extract', key, 'raw', '-o', '-', infoPlist
  ]).stdout.trim();
}

function readSignature(appBundle, run) {
  return run('/usr/bin/codesign', ['-dv', '--verbose=4', appBundle]).stderr;
}

export async function prepareMacosElectronDevSignature({
  appRoot,
  platform = process.platform,
  run = runChecked,
  sign = signAsync
}) {
  if (platform !== 'darwin') return { changed: false, reason: 'not-macos' };
  const appBundle = path.join(appRoot, 'node_modules', 'electron', 'dist', 'Electron.app');
  const infoPlist = path.join(appBundle, 'Contents', 'Info.plist');
  const identities = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning']).stdout;
  if (!identities.includes(`"${DEV_SIGNING_IDENTITY}"`)) {
    throw new Error(`macOS Electron DEV signing identity is unavailable: ${DEV_SIGNING_IDENTITY}`);
  }
  const currentBundleId = readPlistValue(infoPlist, 'CFBundleIdentifier', run);
  const currentBundleName = readPlistValue(infoPlist, 'CFBundleName', run);
  const currentSignature = readSignature(appBundle, run);
  if (currentBundleId === DEV_BUNDLE_ID
    && currentBundleName === DEV_BUNDLE_NAME
    && currentSignature.includes(`Authority=${DEV_SIGNING_IDENTITY}`)
    && !currentSignature.includes('(runtime)')) {
    try {
      run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appBundle]);
      return { changed: false, reason: 'already-signed' };
    } catch {
      // Re-sign the complete bundle when an earlier partial signature left nested code invalid.
    }
  }
  run('/usr/bin/plutil', ['-replace', 'CFBundleIdentifier', '-string', DEV_BUNDLE_ID, infoPlist]);
  run('/usr/bin/plutil', ['-replace', 'CFBundleName', '-string', DEV_BUNDLE_NAME, infoPlist]);
  run('/usr/bin/plutil', ['-replace', 'CFBundleDisplayName', '-string', DEV_BUNDLE_NAME, infoPlist]);
  await sign({
    app: appBundle,
    identity: DEV_SIGNING_IDENTITY,
    optionsForFile: () => ({ hardenedRuntime: false, timestamp: 'none' }),
    platform: 'darwin',
  });
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appBundle]);
  const signed = readSignature(appBundle, run);
  if (!signed.includes(`Authority=${DEV_SIGNING_IDENTITY}`)
    || readPlistValue(infoPlist, 'CFBundleIdentifier', run) !== DEV_BUNDLE_ID
    || readPlistValue(infoPlist, 'CFBundleName', run) !== DEV_BUNDLE_NAME) {
    throw new Error('macOS Electron DEV signature identity verification failed');
  }
  return { changed: true, reason: 'signed' };
}

export const MACOS_ELECTRON_DEV_BUNDLE_ID = DEV_BUNDLE_ID;
export const MACOS_ELECTRON_DEV_BUNDLE_NAME = DEV_BUNDLE_NAME;
export const MACOS_ELECTRON_DEV_SIGNING_IDENTITY = DEV_SIGNING_IDENTITY;
