/* global console, process */

import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';

function runChecked(label, command, args, run) {
  const result = run(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(`${label} failed${detail ? `: ${detail}` : ''}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function requireEntitlements(source, names, subject) {
  for (const name of names) {
    if (!source.includes(name)) throw new Error(`${subject} is missing ${name}`);
  }
}

export async function verifyPackagedMacosApp(options) {
  const run = options.run ?? spawnSync;
  const checkAccess = options.access ?? access;
  const appPath = path.resolve(options.appPath);
  const codexPath = path.join(appPath, 'Contents/MacOS/codex');
  const helperPath = path.join(appPath, 'Contents/Frameworks/Foliole Helper.app');
  await checkAccess(path.join(appPath, 'Contents/embedded.provisionprofile'));
  runChecked('app signature verification', 'codesign', ['--verify', '--deep', '--strict', appPath], run);
  const appEntitlements = runChecked(
    'app entitlement inspection',
    'codesign',
    ['-d', '--entitlements', '-', appPath],
    run
  );
  requireEntitlements(appEntitlements, [
    'com.apple.security.app-sandbox',
    'com.apple.security.files.bookmarks.app-scope',
    'com.apple.security.files.user-selected.read-write'
  ], 'packaged app');
  const codexEntitlements = runChecked(
    'Codex entitlement inspection',
    'codesign',
    ['-d', '--entitlements', '-', codexPath],
    run
  );
  requireEntitlements(codexEntitlements, [
    'com.apple.security.app-sandbox',
    'com.apple.security.cs.allow-jit',
    'com.apple.security.inherit'
  ], 'packaged Codex');
  const helperEntitlements = runChecked(
    'helper entitlement inspection',
    'codesign',
    ['-d', '--entitlements', '-', helperPath],
    run
  );
  requireEntitlements(helperEntitlements, [
    'com.apple.security.app-sandbox',
    'com.apple.security.inherit'
  ], 'packaged helper');
  if (options.notarized) {
    runChecked('notarization ticket validation', 'xcrun', ['stapler', 'validate', appPath], run);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const appIndex = process.argv.indexOf('--app');
  const appPath = appIndex >= 0 ? process.argv[appIndex + 1] : undefined;
  if (!appPath) throw new Error('Usage: node scripts/macos/verify-packaged-app.mjs --app <Foliole.app> [--notarized]');
  verifyPackagedMacosApp({ appPath, notarized: process.argv.includes('--notarized') }).then(() => {
    console.log('[macos-packaged-app] status: OK');
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
