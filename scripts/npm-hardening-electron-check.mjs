#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyElectronVersionEligibility } from './electron-update-eligibility.mjs';
import {
  readElectronVersionEligibilityInput,
  readVerifiedElectronSecurityAdvisory,
  runNpmJson
} from './electron-update-metadata.mjs';
import { runGh } from './github-monitor-gh.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function lockedElectronVersion(repoRoot) {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const lockfile = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
  const manifestVersion = manifest.devDependencies?.electron;
  const rootVersion = lockfile.packages?.['']?.devDependencies?.electron;
  const installedVersion = lockfile.packages?.['node_modules/electron']?.version;
  if (!manifestVersion || manifestVersion !== rootVersion || manifestVersion !== installedVersion) {
    throw new Error('package.json and package-lock.json must agree on one exact Electron version');
  }
  return manifestVersion;
}

export function evaluateLockedElectron({ now, npmMetadata, officialStableVersions, securityAdvisory,
  stableVersionsComplete, version }) {
  return classifyElectronVersionEligibility({
    now,
    officialStableVersions,
    publishedAt: npmMetadata?.time?.[version],
    securityAdvisory,
    stableVersionsComplete,
    version
  });
}

function parseArgs(args) {
  if (args.length === 0) return { advisoryId: null };
  if (args.length === 2 && args[0] === '--advisory') return { advisoryId: args[1] };
  throw new Error('usage: npm-hardening-electron-check.mjs [--advisory GHSA-...]');
}

export function checkLockedElectron(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const version = options.version ?? lockedElectronVersion(repoRoot);
  const now = options.now ?? new Date().toISOString();
  const runGhApi = options.runGh ?? runGh;
  const input = options.eligibilityInput ?? readElectronVersionEligibilityInput({
    now,
    runGh: runGhApi,
    runNpm: options.runNpm ?? runNpmJson,
    version
  });
  const advisoryId = options.advisoryId ?? null;
  const securityAdvisory = advisoryId
    ? readVerifiedElectronSecurityAdvisory({ advisoryId, runGh: runGhApi, version })
    : null;
  const result = classifyElectronVersionEligibility({
    now,
    officialStableVersions: input.officialStableVersions,
    publishedAt: input.npmMetadata?.publishedAt,
    securityAdvisory,
    stableVersionsComplete: input.stableVersionsComplete,
    version
  });
  if (result.classification !== 'eligible') {
    throw new Error(`locked Electron ${version} is ${result.classification}: ${result.reason}`);
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkLockedElectron(parseArgs(process.argv.slice(2)));
    console.log(`[npm-hardening] ok: Electron ${result.version} ${result.reason}`);
  } catch (error) {
    console.error(`[npm-hardening] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
