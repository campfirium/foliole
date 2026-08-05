/* global console, process */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { assertGithubDistributionContract } from './distribution-contract.mjs';
import {
  loadPinnedCodexHelperRelease, runWithCodexHelperRollForward
} from './codex-helper-release.mjs';
import {
  assertExternalPackageOutput, publishArtifactBatch, withTemporaryPackageOutput
} from './package-artifact-lifecycle.mjs';
import { prepareCodexHelper } from './prepare-codex-helper.mjs';
import { prepareFolioleCli } from './prepare-foliole-cli.mjs';
import { prepareGlobalCaptureHelper } from './prepare-global-capture-helper.mjs';
import { verifyPackagedMacosApp } from './verify-packaged-app.mjs';
import { prepareCacheEntry } from '../diagnostics/local-artifact-cache-production.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PUBLISHED_DIRECTORY = path.join(ROOT, 'artifacts/macos/github-arm64');
const DEVELOPER_IDENTITY = 'CAMPFIRIUM LTD (V589TQH334)';
const STABLE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;

function compareVersions(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

export function resolveGithubPackageRequest(args, currentVersion) {
  const prefix = '--acceptance-baseline-version=';
  const argumentsWithVersion = args.filter((argument) => argument.startsWith(prefix));
  if (argumentsWithVersion.length > 1) throw new Error('Only one acceptance baseline version is allowed');
  const version = argumentsWithVersion[0]?.slice(prefix.length);
  if (!version) return { targetDirectory: PUBLISHED_DIRECTORY, version: currentVersion };
  if (!STABLE_VERSION_PATTERN.test(version) || compareVersions(version, currentVersion) >= 0) {
    throw new Error('Acceptance baseline version must be a stable version lower than package.json');
  }
  return {
    acceptanceBaseline: true,
    cacheEntryName: `macos-github-update-baseline-${version}-arm64`,
    targetDirectory: path.join(ROOT, `.cache/macos-github-update-baseline-${version}-arm64`),
    version
  };
}

export function createGithubBuilderConfig(base, options) {
  const portableBase = { ...base };
  const outputDirectory = assertExternalPackageOutput(ROOT, options.outputDirectory);
  const config = {
    ...portableBase,
    appId: 'com.campfirium.foliole',
    directories: { ...base.directories, output: outputDirectory },
    electronDist: options.electronDist,
    extraMetadata: {
      ...(base.extraMetadata ?? {}),
      folioleBuildChannel: 'github',
      ...(options.version ? { version: options.version } : {})
    },
    extraFiles: [
      ...(base.extraFiles ?? []).filter((entry) => entry.from !== 'build/cli'),
      { from: options.codexPath, to: 'MacOS/codex' },
      { from: options.globalCaptureHelperPath, to: 'MacOS/Foliole Global Capture' },
      { from: options.folioleCliPath, to: 'Helpers/Foliole CLI.app' }
    ],
    extraResources: [
      ...base.extraResources,
      { from: 'build/macos/codex-NOTICE.txt', to: 'codex/NOTICE.txt' },
      { from: 'LICENSE', to: 'codex/LICENSE' }
    ],
    mac: {
      ...base.mac,
      artifactName: '${productName}-macOS-${arch}-${version}.${ext}',
      binaries: ['Contents/MacOS/codex', 'Contents/MacOS/Foliole Global Capture'],
      entitlements: 'build/entitlements.mac.plist',
      entitlementsInherit: 'build/entitlements.mac.inherit.plist',
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
      signIgnore: ['Contents/Helpers/Foliole CLI\\.app(?:/|$)'],
      sign: 'scripts/macos/sign-github-app.mjs',
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
    'Developer ID packaging requires FOLIOLE_MACOS_DEVELOPER_ID_PROVISIONING_PROFILE.'
  );
}

export function resolveDeveloperIdCliProvisioningProfile(env = process.env) {
  const configured = env.FOLIOLE_MACOS_CLI_DEVELOPER_ID_PROVISIONING_PROFILE?.trim();
  if (configured) return path.resolve(configured);
  throw new Error(
    'Developer ID CLI packaging requires FOLIOLE_MACOS_CLI_DEVELOPER_ID_PROVISIONING_PROFILE.'
  );
}

export function hasNotarizationCredentials(env) {
  const hasAppleId = env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID;
  const hasApiKey = env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER;
  const hasKeychainProfile = env.APPLE_KEYCHAIN_PROFILE;
  return Boolean(hasAppleId || hasApiKey || hasKeychainProfile);
}

export function createGithubArtifactNames(productName, version, arch = 'arm64') {
  const baseName = `${productName}-macOS-${arch}-${version}`;
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
  const codexRelease = await loadPinnedCodexHelperRelease();
  const provisioningProfile = resolveDeveloperIdProvisioningProfile();
  const cliProvisioningProfile = resolveDeveloperIdCliProvisioningProfile();
  const base = JSON.parse(await readFile(path.join(ROOT, 'electron/builder.json'), 'utf8'));
  const packageMetadata = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const request = resolveGithubPackageRequest(process.argv.slice(2), packageMetadata.version);
  if (request.cacheEntryName) {
    prepareCacheEntry({ entryName: request.cacheEntryName, rootDir: ROOT });
  }
  const codexPath = await prepareCodexHelper({ release: codexRelease });
  console.log(`[codex-helper] build=${codexRelease.version}`);
  const folioleCliPath = await prepareFolioleCli({
    mode: 'developer-id', productVersion: request.version,
    provisioningProfile: cliProvisioningProfile
  });
  const globalCaptureHelperPath = await prepareGlobalCaptureHelper();
  const artifactNames = createGithubArtifactNames(base.productName, request.version);
  const checksum = await runWithCodexHelperRollForward(codexRelease, () => withTemporaryPackageOutput(async (outputDirectory) => {
    const config = createGithubBuilderConfig(base, {
      codexPath, electronDist: base.electronDist, folioleCliPath, globalCaptureHelperPath,
      notarize, outputDirectory, provisioningProfile, version: request.version
    });
    const configPath = path.join(outputDirectory, 'electron-builder.json');
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    run('build', 'npm', ['run', 'build']);
    run('security bookmark addon', 'npm', ['run', 'macos:security-bookmarks:build']);
    run('electron compile', 'npm', ['run', 'electron:compile']);
    run('electron-builder', 'npm', ['exec', '--', 'electron-builder', '--config', configPath, '--mac', '--arm64', '--publish', 'never']);
    await verifyPackagedMacosApp({
      appPath: path.join(outputDirectory, 'mac-arm64/Foliole.app'),
      mode: 'developer-id',
      notarized: notarize,
      version: request.version
    });
    const result = await writeDmgChecksum(outputDirectory, artifactNames[0]);
    await publishArtifactBatch({
      names: artifactNames, sourceDirectory: outputDirectory, targetDirectory: request.targetDirectory
    });
    return result;
  }), { prepareRelease: (release) => prepareCodexHelper({ release }) });
  const status = request.acceptanceBaseline ? 'ACCEPTANCE_BASELINE_READY' : 'DMG_READY';
  console.log(`${status} ${checksum.name} ${checksum.digest}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
