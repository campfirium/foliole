#!/usr/bin/env node
/* global console, process */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertQualityCommandAllowed } from './quality/quality-command-contracts.mjs';

const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;

function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function requireVersion(value, label) {
  if (typeof value !== 'string' || !VERSION.test(value)) {
    throw new Error(`${label} must be a stable semantic version.`);
  }
  return value;
}

export function resolveDesktopUpdaterReleasePolicy(manifest, candidateVersion) {
  const candidate = requireVersion(candidateVersion, 'candidate version');
  const latest = requireVersion(manifest?.latest, 'manifest latest');
  if (compareVersions(candidate, latest) <= 0) {
    throw new Error(`candidate ${candidate} must be newer than public manifest ${latest}.`);
  }
  const policy = manifest?.desktopUpdater;
  if (!policy || policy.manualUpgradeFrom !== '0.7.0') {
    throw new Error('desktop updater policy must preserve the 0.7.0 manual-upgrade boundary.');
  }
  const baseline = policy.verifiedBaselineVersion;
  if (baseline === null) return { baselineVersion: '', bootstrap: true };
  requireVersion(baseline, 'verified updater baseline');
  const releaseVersions = new Set((manifest.releases ?? []).map((entry) => entry?.version));
  if (!releaseVersions.has(baseline) || compareVersions(baseline, latest) > 0) {
    throw new Error('verified updater baseline must identify a public manifest release.');
  }
  return { baselineVersion: baseline, bootstrap: false };
}

export function validatePublishedDesktopUpdaterPolicy(manifest) {
  const latest = requireVersion(manifest?.latest, 'manifest latest');
  const policy = manifest?.desktopUpdater;
  if (!policy || policy.manualUpgradeFrom !== '0.7.0') {
    throw new Error('desktop updater policy must preserve the 0.7.0 manual-upgrade boundary.');
  }
  const first = requireVersion(policy.firstCapableVersion, 'first updater-capable version');
  const baseline = requireVersion(policy.verifiedBaselineVersion, 'verified updater baseline');
  const releases = new Set((manifest.releases ?? []).map((entry) => entry?.version));
  if (![first, baseline].every((version) => releases.has(version))) {
    throw new Error('desktop updater versions must identify public manifest releases.');
  }
  if (compareVersions(first, baseline) > 0 || compareVersions(baseline, latest) > 0) {
    throw new Error('desktop updater versions must progress from first capable through verified baseline to latest.');
  }
  return { baselineVersion: baseline, firstCapableVersion: first };
}

async function main() {
  assertQualityCommandAllowed('runner:desktop-update-release-gate');
  const candidate = process.argv.find((arg) => arg.startsWith('--candidate='))?.slice(12);
  if (!candidate) throw new Error('--candidate=<version> is required.');
  const manifest = JSON.parse(await readFile('releases/update-manifest.json', 'utf8'));
  const result = resolveDesktopUpdaterReleasePolicy(manifest, candidate);
  console.log(`baseline_version=${result.baselineVersion}`);
  console.log(`baseline_bootstrap=${String(result.bootstrap)}`);
}

if (basename(process.argv[1] ?? '') === basename(fileURLToPath(import.meta.url))) {
  await main().catch((error) => {
    console.error(`[desktop-update-policy] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
