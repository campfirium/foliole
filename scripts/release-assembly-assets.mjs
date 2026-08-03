#!/usr/bin/env node
/* global console, process */

import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { validateDesktopUpdateArtifacts } from './desktop-update-artifact-contract.mjs';
import { verifyLinuxDebDirectory } from './linux/linux-deb-contract.mjs';
import { resolveReleasePlatformIdentity } from './release-platform-contract.mjs';
import { validateReleaseAssetDirectory } from './release-asset-contract.mjs';
import { assertQualityCommandAllowed } from './quality/quality-command-contracts.mjs';

function producerChecksum(platform) {
  return platform.managedAssets.find((asset) => asset === `SHA256SUMS-${platform.id}.txt`);
}

function sourceName(platform, asset) {
  return asset === producerChecksum(platform) ? 'SHA256SUMS.txt' : asset;
}

async function validateActiveProducers(identity, inputRoot) {
  const active = identity.registry.platforms.filter((platform) => platform.status === 'active');
  for (const platform of active) {
    const directory = path.join(inputRoot, platform.id);
    if (platform.artifactContract === 'deb') {
      await verifyLinuxDebDirectory(directory, identity.intent.version);
      continue;
    }
    if (platform.artifactContract !== 'desktop-updater') throw new Error(`unsupported active artifact contract: ${platform.artifactContract}`);
    await validateDesktopUpdateArtifacts({
      directory, platform: platform.id,
      version: identity.intent.version
    });
  }
}

export async function assembleReleaseAssets({ identity, inputRoot, outputRoot }) {
  await validateActiveProducers(identity, inputRoot);
  await rm(outputRoot, { force: true, recursive: true });
  await mkdir(outputRoot, { recursive: true });
  const selected = new Set(identity.intent.selectedPlatforms);
  for (const platform of identity.registry.platforms.filter(({ id }) => selected.has(id))) {
    for (const template of platform.managedAssets) {
      const asset = template.replaceAll('{version}', identity.intent.version);
      await cp(path.join(inputRoot, platform.id, sourceName(platform, asset)), path.join(outputRoot, asset));
    }
  }
  return validateReleaseAssetDirectory({ directory: outputRoot, identity });
}

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  assertQualityCommandAllowed('runner:release-draft-assets');
  const [registry, intent] = await Promise.all([
    readFile('.github/release-platforms.json', 'utf8').then(JSON.parse),
    readFile('.github/release-intent.json', 'utf8').then(JSON.parse)
  ]);
  const identity = resolveReleasePlatformIdentity({
    registry, intent, packageVersion: arg('version'), sha: arg('sha')
  });
  const names = await assembleReleaseAssets({
    identity, inputRoot: path.resolve(arg('input-root')), outputRoot: path.resolve(arg('output-root'))
  });
  console.log(`[release-assembly] status: VERIFIED assets=${names.join(',')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await main().catch((error) => {
    console.error(`[release-assembly] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
