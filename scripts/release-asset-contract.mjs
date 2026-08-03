#!/usr/bin/env node
/* global console, process */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { validateDesktopUpdateArtifacts } from './desktop-update-artifact-contract.mjs';
import { verifyLinuxDebDirectory } from './linux/linux-deb-contract.mjs';
import { resolveReleasePlatformIdentity } from './release-platform-contract.mjs';
import { assertQualityCommandAllowed } from './quality/quality-command-contracts.mjs';

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

export function assertExactReleaseAssets(identity, actualNames) {
  const expected = sorted(identity.managedAssets);
  const actual = sorted(actualNames);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`release assets differ from intent: expected=${expected.join(',')} actual=${actual.join(',')}`);
  }
  return expected;
}

export function allManagedReleaseAssets(identity) {
  return sorted(identity.registry.platforms.flatMap((platform) => platform.managedAssets
    .map((asset) => asset.replaceAll('{version}', identity.intent.version))));
}

function selectedPlatforms(identity) {
  const selected = new Set(identity.intent.selectedPlatforms);
  return identity.registry.platforms.filter((platform) => selected.has(platform.id));
}

export async function validateReleaseAssetDirectory({ directory, identity }) {
  const names = await readdir(directory);
  assertExactReleaseAssets(identity, names);
  for (const platform of selectedPlatforms(identity)) {
    if (platform.artifactContract === 'deb') {
      await verifyLinuxDebDirectory(directory, identity.intent.version, {
        allowOtherFiles: true, checksumFile: `SHA256SUMS-${platform.id}.txt`
      });
      continue;
    }
    if (platform.artifactContract !== 'desktop-updater') throw new Error(`unsupported release artifact contract: ${platform.artifactContract}`);
    await validateDesktopUpdateArtifacts({
      checksumFile: `SHA256SUMS-${platform.id}.txt`, directory, platform: platform.id,
      version: identity.intent.version
    });
  }
  return sorted(names);
}

async function readIdentity(version, sha = 'release-assets') {
  const [registry, intent] = await Promise.all([
    readFile('.github/release-platforms.json', 'utf8').then(JSON.parse),
    readFile('.github/release-intent.json', 'utf8').then(JSON.parse)
  ]);
  return resolveReleasePlatformIdentity({ registry, intent, packageVersion: version, sha });
}

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  assertQualityCommandAllowed('runner:release-draft-assets');
  const command = process.argv[2];
  const identity = await readIdentity(arg('version'), arg('sha'));
  if (command === 'list') {
    console.log(identity.managedAssets.join('\n'));
    return;
  }
  if (command === 'managed') {
    console.log(allManagedReleaseAssets(identity).join('\n'));
    return;
  }
  if (command === 'verify') {
    const actual = JSON.parse(await readFile(path.resolve(arg('actual')), 'utf8'));
    assertExactReleaseAssets(identity, actual);
    return;
  }
  if (command === 'verify-directory') {
    await validateReleaseAssetDirectory({ directory: path.resolve(arg('directory')), identity });
    return;
  }
  throw new Error('release asset command must be list, managed, verify, or verify-directory.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await main().catch((error) => {
    console.error(`[release-assets] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
