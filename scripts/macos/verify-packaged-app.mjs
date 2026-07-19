/* global console, process */

import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';

const APP_GROUP = 'V589TQH334.group.com.campfirium.foliole.agent-control';
const TEAM_ID = 'V589TQH334';

function runChecked(label, command, args, run, options = {}) {
  const result = run(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(`${label} failed${detail ? `: ${detail}` : ''}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function decodeProfile(profilePath, run) {
  const securityResult = run('security', ['cms', '-D', '-i', profilePath], { encoding: 'utf8' });
  if (securityResult.status === 0) return securityResult.stdout;
  return runChecked('provisioning profile decode', 'openssl', [
    'smime', '-verify', '-inform', 'DER', '-noverify', '-in', profilePath
  ], run);
}

function plistValue(source, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`<key>${escaped}</key>\\s*<(string|true|false)(?:\\s*/)?>([^<]*)`));
  if (!match) return undefined;
  if (match[1] === 'true') return true;
  if (match[1] === 'false') return false;
  return match[2];
}

function plistArray(source, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`<key>${escaped}</key>\\s*<array>([\\s\\S]*?)</array>`));
  return [...(match?.[1] ?? '').matchAll(/<string>([^<]+)<\/string>/g)].map((item) => item[1]);
}

function requireProfile(profile, expected, mode, subject) {
  if (!plistArray(profile, 'TeamIdentifier').includes(TEAM_ID)) throw new Error(`${subject} has the wrong team`);
  if (plistValue(profile, 'com.apple.application-identifier') !== `${TEAM_ID}.${expected.bundleId}`) {
    throw new Error(`${subject} has the wrong application identifier`);
  }
  if (plistValue(profile, 'com.apple.developer.team-identifier') !== TEAM_ID) {
    throw new Error(`${subject} has the wrong entitlement team`);
  }
  if (!plistArray(profile, 'com.apple.security.application-groups').includes(expected.profileAppGroup)) {
    throw new Error(`${subject} is missing the Foliole App Group`);
  }
  if (mode === 'distribution') {
    if (plistValue(profile, 'get-task-allow') === true || profile.includes('<key>ProvisionedDevices</key>')) {
      throw new Error(`${subject} is a development profile`);
    }
  } else if (!plistArray(profile, 'ProvisionedDevices').length) {
    throw new Error(`${subject} is not a development profile`);
  }
}

function requireSignatureDetails(details, expected, mode, subject) {
  requireEntitlements(details, [`Identifier=${expected.bundleId}`, `TeamIdentifier=${TEAM_ID}`], subject);
  const authority = mode === 'distribution'
    ? 'Authority=3rd Party Mac Developer Application: CAMPFIRIUM LTD'
    : 'Authority=Apple Development:';
  requireEntitlements(details, [authority], subject);
  if (mode === 'distribution' && details.includes('Authority=Apple Development:')) {
    throw new Error(`${subject} uses a development signing identity`);
  }
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
  const mode = options.mode === 'distribution' ? 'distribution' : 'development';
  const codexPath = path.join(appPath, 'Contents/MacOS/codex');
  const helperPath = path.join(appPath, 'Contents/Frameworks/Foliole Helper.app');
  const cliAppPath = path.join(appPath, 'Contents/Helpers/Foliole CLI.app');
  const publicLauncherPath = path.join(cliAppPath, 'Contents/MacOS/foliole');
  const cliRuntimePath = path.join(cliAppPath, 'Contents/MacOS/foliole-runtime');
  const appProfilePath = path.join(appPath, 'Contents/embedded.provisionprofile');
  const cliProfilePath = path.join(cliAppPath, 'Contents/embedded.provisionprofile');
  await checkAccess(appProfilePath);
  await checkAccess(cliProfilePath);
  await checkAccess(publicLauncherPath, constants.X_OK);
  await checkAccess(cliRuntimePath, constants.X_OK);
  runChecked('app signature verification', 'codesign', ['--verify', '--deep', '--strict', appPath], run);
  const profileAppGroup = 'group.com.campfirium.foliole.agent-control';
  requireProfile(decodeProfile(appProfilePath, run), {
    bundleId: 'com.campfirium.foliole', profileAppGroup
  }, mode, 'app profile');
  requireProfile(decodeProfile(cliProfilePath, run), {
    bundleId: 'com.campfirium.foliole.cli', profileAppGroup
  }, mode, 'CLI profile');
  const appSignature = runChecked(
    'app signature inspection', 'codesign', ['-dv', '--verbose=4', appPath], run
  );
  requireSignatureDetails(appSignature, { bundleId: 'com.campfirium.foliole' }, mode, 'packaged app signature');
  const cliSignature = runChecked(
    'CLI signature inspection', 'codesign', ['-dv', '--verbose=4', cliAppPath], run
  );
  requireSignatureDetails(cliSignature, { bundleId: 'com.campfirium.foliole.cli' }, mode, 'packaged CLI signature');
  const appEntitlements = runChecked(
    'app entitlement inspection',
    'codesign',
    ['-d', '--entitlements', '-', appPath],
    run
  );
  requireEntitlements(appEntitlements, [
    'com.apple.security.app-sandbox',
    'com.apple.security.application-groups',
    APP_GROUP,
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
  const cliEntitlements = runChecked(
    'CLI entitlement inspection', 'codesign', ['-d', '--entitlements', '-', cliAppPath], run
  );
  requireEntitlements(cliEntitlements, [
    'com.apple.security.app-sandbox',
    'com.apple.security.application-groups',
    APP_GROUP
  ], 'packaged CLI');
  runChecked('CLI help', publicLauncherPath, ['--help'], run);
  runChecked('CLI version', publicLauncherPath, ['--version'], run);
  if (options.notarized) {
    runChecked('notarization ticket validation', 'xcrun', ['stapler', 'validate', appPath], run);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const appIndex = process.argv.indexOf('--app');
  const appPath = appIndex >= 0 ? process.argv[appIndex + 1] : undefined;
  if (!appPath) throw new Error('Usage: node scripts/macos/verify-packaged-app.mjs --app <Foliole.app> [--distribution] [--notarized]');
  verifyPackagedMacosApp({
    appPath,
    mode: process.argv.includes('--distribution') ? 'distribution' : 'development',
    notarized: process.argv.includes('--notarized')
  }).then(() => {
    console.log('[macos-packaged-app] status: OK');
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
