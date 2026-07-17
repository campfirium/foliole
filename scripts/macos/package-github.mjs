/* global console, process */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { assertGithubDistributionContract } from './distribution-contract.mjs';
import {
  assertExternalPackageOutput, publishArtifactBatch, withTemporaryPackageOutput
} from './package-artifact-lifecycle.mjs';
import { prepareMasElectronRuntime } from './mas-electron-runtime.mjs';
import { prepareCodexHelper } from './prepare-codex-helper.mjs';
import { verifyPackagedMacosApp } from './verify-packaged-app.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PUBLISHED_DIRECTORY = path.join(ROOT, 'artifacts/macos/github-arm64');
const DEVELOPER_IDENTITY = 'CAMPFIRIUM LTD (V589TQH334)';

export function createGithubBuilderConfig(base, options) {
  const portableBase = { ...base };
  const outputDirectory = assertExternalPackageOutput(ROOT, options.outputDirectory);
  const config = {
    ...portableBase,
    appId: 'com.campfirium.foliole',
    directories: { ...base.directories, output: outputDirectory },
    electronDist: options.electronDist,
    extraFiles: [
      ...(base.extraFiles ?? []),
      { from: options.codexPath, to: 'MacOS/codex' }
    ],
    extraResources: [
      ...base.extraResources,
      { from: 'build/macos/codex-NOTICE.txt', to: 'codex/NOTICE.txt' },
      { from: 'LICENSE', to: 'codex/LICENSE' }
    ],
    mac: {
      ...base.mac,
      artifactName: '${productName}-${version}-mac-${arch}.${ext}',
      binaries: ['Contents/MacOS/codex'],
      entitlements: 'build/entitlements.mas.plist',
      entitlementsInherit: 'build/entitlements.mas.inherit.plist',
      extendInfo: {
        ...(base.mac?.extendInfo ?? {}),
        ElectronTeamID: 'V589TQH334'
      },
      forceCodeSigning: true,
      hardenedRuntime: true,
      identity: DEVELOPER_IDENTITY,
      notarize: options.notarize,
      preAutoEntitlements: true,
      provisioningProfile: options.provisioningProfile,
      sign: 'scripts/macos/sign-mas-app.mjs',
      target: ['dmg', 'zip']
    }
  };
  assertGithubDistributionContract(config);
  return config;
}

export function resolveDeveloperIdProvisioningProfile(env = process.env) {
  const configured = env.FOLIOLE_MACOS_DEVELOPER_ID_PROVISIONING_PROFILE?.trim();
  if (configured) return path.resolve(configured);
  throw new Error(
    'Developer ID sandbox packaging requires FOLIOLE_MACOS_DEVELOPER_ID_PROVISIONING_PROFILE.'
  );
}

export function hasNotarizationCredentials(env) {
  const hasAppleId = env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID;
  const hasApiKey = env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER;
  const hasKeychainProfile = env.APPLE_KEYCHAIN_PROFILE;
  return Boolean(hasAppleId || hasApiKey || hasKeychainProfile);
}

export function sendMacosNotification(title, message, run = spawnSync) {
  const script = 'on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run';
  const result = run('osascript', ['-e', script, '--', title, message], { stdio: 'ignore' });
  return result.status === 0;
}

export function createGithubArtifactNames(productName, version, arch = 'arm64') {
  const baseName = `${productName}-${version}-mac-${arch}`;
  return [
    `${baseName}.dmg`,
    `${baseName}.dmg.blockmap`,
    `${baseName}.zip`,
    `${baseName}.zip.blockmap`,
    'latest-mac.yml',
    'SHA256SUMS.txt'
  ];
}

export async function writeDmgChecksum(outputDirectory, dmgName) {
  if (!dmgName.endsWith('.dmg')) throw new Error(`Expected an exact DMG artifact name; received ${dmgName}`);
  const digest = createHash('sha256').update(await readFile(path.join(outputDirectory, dmgName))).digest('hex');
  await writeFile(path.join(outputDirectory, 'SHA256SUMS.txt'), `${digest}  ${dmgName}\n`);
  return { digest, name: dmgName };
}

function run(label, command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, env: process.env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('GitHub macOS packaging requires an arm64 Mac');
  }
  const notarize = process.argv.includes('--notarize');
  if (notarize && !hasNotarizationCredentials(process.env)) {
    throw new Error('Notarization credentials are unavailable; configure an approved notarytool authentication method');
  }
  const provisioningProfile = resolveDeveloperIdProvisioningProfile();
  const codexPath = await prepareCodexHelper();
  const electronDist = await prepareMasElectronRuntime();
  const base = JSON.parse(await readFile(path.join(ROOT, 'electron/builder.json'), 'utf8'));
  const packageMetadata = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const artifactNames = createGithubArtifactNames(base.productName, packageMetadata.version);
  const checksum = await withTemporaryPackageOutput(async (outputDirectory) => {
    const config = createGithubBuilderConfig(base, {
      codexPath, electronDist, notarize, outputDirectory, provisioningProfile
    });
    const configPath = path.join(outputDirectory, 'electron-builder.json');
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    run('build', 'npm', ['run', 'build']);
    run('security bookmark addon', 'npm', ['run', 'macos:security-bookmarks:build']);
    run('electron compile', 'npm', ['run', 'electron:compile']);
    run('electron-builder', 'npm', ['exec', '--', 'electron-builder', '--config', configPath, '--mac', '--arm64', '--publish', 'never']);
    await verifyPackagedMacosApp({
      appPath: path.join(outputDirectory, 'mac-arm64/Foliole.app'), notarized: notarize
    });
    const result = await writeDmgChecksum(outputDirectory, artifactNames[0]);
    await publishArtifactBatch({ names: artifactNames, sourceDirectory: outputDirectory, targetDirectory: PUBLISHED_DIRECTORY });
    return result;
  });
  console.log(`DMG_READY ${checksum.name} ${checksum.digest}`);
  sendMacosNotification(
    'Foliole macOS release',
    notarize ? 'Apple notarization and DMG packaging completed.' : 'macOS DMG packaging completed.'
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    sendMacosNotification('Foliole macOS release', 'Notarization or DMG packaging failed. Check the terminal log.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
