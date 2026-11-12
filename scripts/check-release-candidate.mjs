#!/usr/bin/env node
/* global console, process */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

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

const execFileAsync = promisify(execFile);

function candidateReader(rootDir, commit) {
  if (commit === undefined) {
    return (path) => readFile(join(rootDir, path), 'utf8');
  }
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(commit)) {
    throw new Error('Release candidate commit must be a full Git object ID.');
  }
  return async (path) => {
    const { stdout } = await execFileAsync('git', ['cat-file', 'blob', `${commit}:${path}`], {
      cwd: rootDir,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024
    });
    return stdout;
  };
}

async function validateCandidate(read) {
  const readJson = (path) => read(path).then(JSON.parse);
  const [
    androidGradle, intent, iosInfoPlist, iosProject, manifest, packageJson, packageLock, registry
  ] = await Promise.all([
    read('android/app/build.gradle'),
    readJson('.github/release-intent.json'),
    read('ios/App/App/Info.plist'),
    read('ios/App/App.xcodeproj/project.pbxproj'),
    readJson('releases/update-manifest.json'),
    readJson('package.json'),
    readJson('package-lock.json'),
    readJson('.github/release-platforms.json')
  ]);
  return validateReleaseCandidateFiles({
    androidGradle, intent, iosInfoPlist, iosProject, manifest, packageJson, packageLock, registry
  });
}

export function validateCurrentReleaseCandidate(rootDir = process.cwd()) {
  return validateCandidate(candidateReader(rootDir));
}

const FEATURE_PREVIEW_HEADINGS = {
  internal: 'Hidden in public builds',
  experimental: 'Available to opt in on public builds',
  public: 'Available by default in public builds'
};

export function formatFeaturePreviewReport(previews) {
  const entries = Object.values(previews);
  for (const preview of entries) {
    if (!Object.hasOwn(FEATURE_PREVIEW_HEADINGS, preview.visibility)) {
      throw new Error(`Invalid visibility for feature preview: ${preview.name}`);
    }
  }
  return Object.entries(FEATURE_PREVIEW_HEADINGS).flatMap(([visibility, heading]) => {
    const names = entries.filter(preview => preview.visibility === visibility).map(preview => `  - ${preview.name}`);
    return names.length ? [`[release-candidate] ${heading}:`, ...names] : [];
  });
}

async function main() {
  assertQualityCommandAllowed('check:release-candidate');
  const { values } = parseArgs({ options: { commit: { type: 'string' } } });
  const read = candidateReader(process.cwd(), values.commit);
  const result = await validateCandidate(read);
  const previews = JSON.parse(await read('src/shared/config/featurePreviews.json'));
  for (const line of formatFeaturePreviewReport(previews)) console.log(line);
  console.log(
    `[release-candidate] status: OK version=${result.version} ` +
    `mode=${result.publicationMode} platforms=${result.selectedPlatforms.join(',')}`
  );
}

if (basename(process.argv[1] ?? '') === basename(fileURLToPath(import.meta.url))) {
  await main();
}
