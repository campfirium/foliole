#!/usr/bin/env node
/* global console, process */

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FULL_SHA = /^[0-9a-f]{40}$/u;
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function required(value, name) {
  const normalized = value?.trim() ?? '';
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function resolveTargetVersion({ eventName, refName, targetVersion }) {
  if (eventName !== 'push') return required(targetVersion, 'target_version');
  const match = /^release\/(.+)$/u.exec(required(refName, 'release push ref'));
  if (!match) throw new Error('Release push ref must match release/<version>.');
  if (targetVersion?.trim() && targetVersion.trim() !== match[1]) {
    throw new Error('target_version does not match the release push ref.');
  }
  return match[1];
}

export function validateReleaseTarget({
  eventName,
  headSha,
  packageVersion,
  refName,
  runSha,
  targetSha,
  targetVersion
}) {
  const version = resolveTargetVersion({ eventName, refName, targetVersion });
  const sha = required(targetSha, 'target_sha');
  if (!VERSION.test(version)) throw new Error('target_version must be a valid explicit version.');
  if (!FULL_SHA.test(sha)) throw new Error('target_sha must be a lowercase 40-character commit SHA.');
  if (required(packageVersion, 'package.json version') !== version) {
    throw new Error('package.json version does not match target_version.');
  }
  if (required(runSha, 'workflow run SHA') !== sha) {
    throw new Error('Workflow run SHA does not match target_sha.');
  }
  if (required(headSha, 'checked-out HEAD') !== sha) {
    throw new Error('Checked-out HEAD does not match target_sha.');
  }
  return { sha, version };
}

export async function validateCurrentReleaseTarget({ cwd = process.cwd(), env = process.env } = {}) {
  const packageJson = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'));
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  return validateReleaseTarget({
    eventName: env.FOLIOLE_RELEASE_EVENT_NAME?.trim(),
    headSha,
    packageVersion: packageJson.version,
    refName: env.FOLIOLE_RELEASE_REF_NAME?.trim(),
    runSha: env.FOLIOLE_RELEASE_RUN_SHA?.trim(),
    targetSha: env.FOLIOLE_RELEASE_TARGET_SHA?.trim(),
    targetVersion: env.FOLIOLE_RELEASE_TARGET_VERSION?.trim()
  });
}

async function main() {
  const target = await validateCurrentReleaseTarget();
  console.log(`target_version=${target.version}`);
  console.log(`target_sha=${target.sha}`);
}

if (basename(process.argv[1] ?? '') === basename(fileURLToPath(import.meta.url))) {
  await main();
}
