/* global process */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createTestflightCandidate } from './testflight-candidate.mjs';
import { verifyTestflightArchive, verifyTestflightIpa } from './testflight-signature.mjs';
import { verifyMobileEvidenceIdentity } from './mobile-beta-evidence.mjs';

function run(command, args, options = {}) {
  return execFileSync(command, args, { stdio: 'inherit', ...options });
}

function capture(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim();
}

export function testflightBuildEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) =>
    key !== 'FOLIOLE_DEV_LIVE_RELOAD' && !key.startsWith('VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE') &&
    !key.startsWith('VITE_FOLIOLE_IOS_DATABASE_UPGRADE_FAULT')));
}

export function distributionSigningConfig(profiles) {
  for (const target of ['App', 'FolioleShareExtension']) {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(profiles[target] ?? '')) {
      throw new Error(`Missing App Store profile for ${target}`);
    }
  }
  return ['CODE_SIGN_STYLE = Manual', 'CODE_SIGN_IDENTITY = Apple Distribution',
    'CODE_SIGNING_ALLOWED = $(FOLIOLE_SIGNING_$(TARGET_NAME):default=NO)',
    'FOLIOLE_SIGNING_App = YES', 'FOLIOLE_SIGNING_FolioleShareExtension = YES',
    'PROVISIONING_PROFILE_SPECIFIER = $(FOLIOLE_PROFILE_$(TARGET_NAME))',
    `FOLIOLE_PROFILE_App = ${profiles.App}`,
    `FOLIOLE_PROFILE_FolioleShareExtension = ${profiles.FolioleShareExtension}`, ''].join('\n');
}

export function archiveArguments({ archive, derivedData, candidate, keyPath, signingConfig }) {
  return ['-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Release',
    '-destination', 'generic/platform=iOS', '-derivedDataPath', derivedData, '-archivePath', archive,
    '-onlyUsePackageVersionsFromResolvedFile', '-disableAutomaticPackageResolution',
    '-allowProvisioningUpdates', '-authenticationKeyPath', keyPath,
    '-authenticationKeyID', process.env.APPLE_API_KEY_ID,
    '-authenticationKeyIssuerID', process.env.APPLE_API_ISSUER,
    '-xcconfig', signingConfig, 'DEVELOPMENT_TEAM=V589TQH334',
    `MARKETING_VERSION=${candidate.version}`, `CURRENT_PROJECT_VERSION=${candidate.buildNumber}`, 'archive'];
}

async function exportArchive({ output, archive, keyPath, env, profiles }) {
  const options = path.join(output, 'ExportOptions.plist');
  await writeFile(options, '<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>' +
    '<key>method</key><string>app-store-connect</string><key>destination</key><string>export</string>' +
    '<key>signingStyle</key><string>manual</string><key>teamID</key><string>V589TQH334</string>' +
    '<key>signingCertificate</key><string>Apple Distribution</string><key>provisioningProfiles</key><dict>' +
    `<key>com.campfirium.foliole.ios</key><string>${profiles.App}</string>` +
    `<key>com.campfirium.foliole.ios.share</key><string>${profiles.FolioleShareExtension}</string></dict>` +
    '<key>manageAppVersionAndBuildNumber</key><false/><key>testFlightInternalTestingOnly</key><false/>' +
    '<key>uploadSymbols</key><true/></dict></plist>');
  const exportDirectory = path.join(output, 'export');
  run('xcodebuild', ['-exportArchive', '-archivePath', archive, '-exportPath', exportDirectory,
    '-exportOptionsPlist', options, '-allowProvisioningUpdates', '-authenticationKeyPath', keyPath,
    '-authenticationKeyID', env.APPLE_API_KEY_ID, '-authenticationKeyIssuerID', env.APPLE_API_ISSUER], { env });
  return exportDirectory;
}

async function main() {
  const env = testflightBuildEnv(process.env);
  if (env.GITHUB_ACTIONS !== 'true' || process.platform !== 'darwin') {
    throw new Error('Signed TestFlight packaging runs only on the trusted macOS GitHub runner');
  }
  const candidate = createTestflightCandidate({
    headSha: capture('git', ['rev-parse', 'HEAD']), acceptedSha: env.TARGET_SHA,
    runSha: env.GITHUB_SHA, ref: env.GITHUB_REF, runId: env.GITHUB_RUN_ID,
    buildNumber: env.FOLIOLE_IOS_BUILD_NUMBER, executionLane: env.FOLIOLE_IOS_EXECUTION_LANE,
    version: env.TARGET_VERSION, packageVersion: JSON.parse(await readFile('package.json', 'utf8')).version
  });
  if (env.FOLIOLE_IOS_QUALITY_EVIDENCE) {
    candidate.qualityEvidence = verifyMobileEvidenceIdentity(JSON.parse(await readFile(
      env.FOLIOLE_IOS_QUALITY_EVIDENCE, 'utf8')), { sourceSha: candidate.sourceSha, runId: candidate.runId });
  }
  if (capture('git', ['status', '--porcelain', '--untracked-files=no'])) throw new Error('Candidate source is dirty');
  const output = path.resolve('.tmp/artifacts/ios-testflight');
  const derivedData = path.resolve('.cache/ios-testflight/DerivedData');
  const archive = path.join(output, 'Foliole.xcarchive');
  const keyPath = env.APPLE_API_KEY;
  if (!keyPath || !env.APPLE_API_KEY_ID || !env.APPLE_API_ISSUER) throw new Error('Apple API credentials are missing');
  await mkdir(output, { recursive: true });
  await mkdir(derivedData, { recursive: true });
  run('npm', ['run', 'android:web:build'], { env });
  run('npx', ['cap', 'sync', 'ios'], { env });
  const profileFile = path.join(output, 'signing-profiles.json');
  run('bundle', ['exec', 'fastlane', 'ios', 'prepare_signing'], {
    cwd: path.resolve('scripts/ios'), env: { ...env, FOLIOLE_IOS_SIGNING_PROFILES: profileFile }
  });
  const profiles = JSON.parse(await readFile(profileFile, 'utf8'));
  const signingConfig = path.join(output, 'Distribution.xcconfig');
  await writeFile(signingConfig, distributionSigningConfig(profiles));
  run('xcodebuild', archiveArguments({ archive, derivedData, candidate, keyPath, signingConfig }), { env });
  verifyTestflightArchive(archive, candidate);
  const exportDirectory = await exportArchive({ output, archive, keyPath, env, profiles });
  const files = (await readdir(exportDirectory)).filter((name) => name.endsWith('.ipa'));
  if (files.length !== 1) throw new Error('Expected exactly one exported signed IPA');
  const ipa = path.join(exportDirectory, files[0]);
  verifyTestflightIpa(ipa, path.join(output, 'ipa-verification'), candidate);
  const receipt = { ...candidate, ipaSha256: createHash('sha256').update(await readFile(ipa)).digest('hex') };
  await writeFile(path.join(output, 'candidate.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  await writeFile(process.env.GITHUB_ENV, `FOLIOLE_IOS_IPA=${ipa}\n`, { flag: 'a' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) await main();
