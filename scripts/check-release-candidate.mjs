#!/usr/bin/env node
/* global console, process */

import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateMobilePlatformVersions } from './mobile-store-identity-contract.mjs';
import { assertQualityCommandAllowed } from './quality/quality-command-contracts.mjs';
import { resolveReleasePlatformIdentity } from './release-platform-contract.mjs';
import { assertT7Publication } from './release-publication-contract.mjs';

function requireLockVersion(packageLock, packageVersion) {
  const rootVersion = packageLock?.packages?.['']?.version;
  if (packageLock?.version !== packageVersion || rootVersion !== packageVersion) {
    throw new Error('package-lock.json root versions must match package.json version.');
  }
}

export function validateReleaseCandidateFiles({
  androidGradle,
  intent,
  iosInfoPlist,
  iosProject,
  manifest,
  packageJson,
  packageLock,
  registry
}) {
  const version = packageJson?.version;
  requireLockVersion(packageLock, version);
  const identity = resolveReleasePlatformIdentity({
    intent, packageVersion: version, registry, sha: 'local-release-preflight'
  });
  const publication = assertT7Publication(identity, manifest);
  const mobile = validateMobilePlatformVersions({
    androidGradle, iosInfoPlist, iosProject, packageVersion: version
  });
  return {
    mobile,
    publicationMode: publication.mode,
    selectedPlatforms: identity.intent.selectedPlatforms,
    version
  };
}

async function readJson(rootDir, path) {
  return readFile(join(rootDir, path), 'utf8').then(JSON.parse);
}

export async function validateCurrentReleaseCandidate(rootDir = process.cwd()) {
  const [
    androidGradle, intent, iosInfoPlist, iosProject, manifest, packageJson, packageLock, registry
  ] = await Promise.all([
    readFile(join(rootDir, 'android/app/build.gradle'), 'utf8'),
    readJson(rootDir, '.github/release-intent.json'),
    readFile(join(rootDir, 'ios/App/App/Info.plist'), 'utf8'),
    readFile(join(rootDir, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8'),
    readJson(rootDir, 'releases/update-manifest.json'),
    readJson(rootDir, 'package.json'),
    readJson(rootDir, 'package-lock.json'),
    readJson(rootDir, '.github/release-platforms.json')
  ]);
  return validateReleaseCandidateFiles({
    androidGradle, intent, iosInfoPlist, iosProject, manifest, packageJson, packageLock, registry
  });
}

async function main() {
  assertQualityCommandAllowed('check:release-candidate');
  const result = await validateCurrentReleaseCandidate();
  console.log(
    `[release-candidate] status: OK version=${result.version} ` +
    `mode=${result.publicationMode} platforms=${result.selectedPlatforms.join(',')}`
  );
}

if (basename(process.argv[1] ?? '') === basename(fileURLToPath(import.meta.url))) {
  await main();
}
