#!/usr/bin/env node
/* global console, process */

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertQualityCommandAllowed } from './quality/quality-command-contracts.mjs';
import {
  assertReleaseIntentDigest,
  resolveReleasePlatformIdentity
} from './release-platform-contract.mjs';
import { assertT7Publication } from './release-publication-contract.mjs';

const FULL_SHA = /^[0-9a-f]{40}$/u;
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function required(value, name) {
  const normalized = value?.trim() ?? '';
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

export function validateReleaseTarget({
  headSha,
  packageVersion,
  refName,
  runSha
}) {
  const version = required(packageVersion, 'package.json version');
  const sha = required(runSha, 'workflow run SHA');
  if (required(refName, 'release ref name') !== 'release') {
    throw new Error('Release ref name must be the exact release branch.');
  }
  if (!VERSION.test(version)) throw new Error('package.json version must be a valid release version.');
  if (!FULL_SHA.test(sha)) throw new Error('workflow run SHA must be a lowercase 40-character commit SHA.');
  if (required(headSha, 'checked-out HEAD') !== sha) {
    throw new Error('Checked-out HEAD does not match the workflow run SHA.');
  }
  return { sha, version };
}

export async function validateCurrentReleaseTarget({ cwd = process.cwd(), env = process.env } = {}) {
  const [packageJson, registry, intent, manifest] = await Promise.all([
    readFile(join(cwd, 'package.json'), 'utf8').then(JSON.parse),
    readFile(join(cwd, '.github/release-platforms.json'), 'utf8').then(JSON.parse),
    readFile(join(cwd, '.github/release-intent.json'), 'utf8').then(JSON.parse),
    readFile(join(cwd, 'releases/update-manifest.json'), 'utf8').then(JSON.parse)
  ]);
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  const target = validateReleaseTarget({
    headSha,
    packageVersion: packageJson.version,
    refName: env.FOLIOLE_RELEASE_REF_NAME?.trim(),
    runSha: env.FOLIOLE_RELEASE_RUN_SHA?.trim()
  });
  const identity = resolveReleasePlatformIdentity({
    registry, intent, packageVersion: target.version, sha: target.sha
  });
  const publication = env.FOLIOLE_RELEASE_REQUIRE_PUBLICATION_MODE === 'true'
    ? assertT7Publication(identity, manifest)
    : null;
  assertReleaseIntentDigest(identity, env.FOLIOLE_RELEASE_EXPECTED_INTENT_DIGEST?.trim());
  return { ...target, ...identity, publication };
}

async function main() {
  assertQualityCommandAllowed('runner:release-target-contract');
  const target = await validateCurrentReleaseTarget();
  console.log(`target_version=${target.version}`);
  console.log(`target_sha=${target.sha}`);
  console.log(`release_intent_digest=${target.digest}`);
  console.log(`release_scope=${target.intent.selectedPlatforms.join(',')}`);
  console.log(`release_hard_gates=${target.hardGatePlatforms.join(',')}`);
  if (target.publication) {
    console.log(`release_bridge_version=${target.publication.bridgeVersion}`);
    console.log(`release_make_latest=${target.publication.makeLatest}`);
  }
  for (const [platform, baseline] of Object.entries(target.updaterBaselines)) {
    console.log(`${platform.replaceAll('-', '_')}_updater_baseline_version=${baseline}`);
  }
}

if (basename(process.argv[1] ?? '') === basename(fileURLToPath(import.meta.url))) {
  await main();
}
