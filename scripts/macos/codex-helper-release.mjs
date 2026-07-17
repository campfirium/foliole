#!/usr/bin/env node
/* global console, fetch, process */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const LOCK_PATH = path.join(ROOT, 'build/macos/codex-helper-release.json');
const LATEST_RELEASE_API = 'https://api.github.com/repos/openai/codex/releases/latest';
const STABLE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;

export async function loadPinnedCodexHelperRelease(lockPath = LOCK_PATH) {
  return parsePinnedRelease(JSON.parse(await readFile(lockPath, 'utf8')));
}

export async function fetchLatestStableCodexRelease(fetchImpl = fetch) {
  const response = await fetchImpl(LATEST_RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  });
  if (!response.ok) throw new Error(`Codex release check failed: HTTP ${response.status}`);
  return parseOfficialRelease(await response.json());
}

export async function checkCodexHelperRelease(options = {}) {
  const pinned = await loadPinnedCodexHelperRelease(options.lockPath);
  const latest = await fetchLatestStableCodexRelease(options.fetchImpl);
  const versionStatus = compareVersions(pinned.version, latest.version);
  const matchesOfficialAsset = pinned.assetName === latest.assetName && pinned.sha256 === latest.sha256;
  const status = versionStatus === 'current' && !matchesOfficialAsset ? 'mismatch' : versionStatus;
  return { latest, pinned, status };
}

export async function updateCodexHelperRelease(options = {}) {
  const result = await checkCodexHelperRelease(options);
  if (result.status === 'ahead') throw new Error('Pinned Codex version is newer than the latest official stable release');
  if (result.status === 'current') return result;
  const next = { assetName: result.latest.assetName, sha256: result.latest.sha256, version: result.latest.version };
  await (options.writeFileImpl ?? writeFile)(options.lockPath ?? LOCK_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return { ...result, pinned: next, status: 'updated' };
}

export async function assertPinnedCodexHelperIsCurrent(options = {}) {
  const result = await checkCodexHelperRelease(options);
  if (result.status !== 'current') {
    throw new Error(`Bundled Codex ${result.pinned.version} is ${result.status}; latest stable is ${result.latest.version}`);
  }
  return result.pinned;
}

function parsePinnedRelease(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid Codex helper release lock');
  const { assetName, sha256, version } = value;
  if (typeof assetName !== 'string' || !assetName.endsWith('.tar.gz')) throw new Error('Invalid Codex helper asset name');
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(sha256)) throw new Error('Invalid Codex helper SHA-256');
  if (typeof version !== 'string' || !STABLE_VERSION_PATTERN.test(version)) throw new Error('Codex helper must pin a stable release');
  return { assetName, sha256, version };
}

function parseOfficialRelease(value) {
  if (!value || typeof value !== 'object' || value.draft || value.prerelease) {
    throw new Error('GitHub latest release is not an official stable Codex release');
  }
  const version = typeof value.tag_name === 'string' ? value.tag_name.replace(/^rust-v/u, '') : '';
  if (!STABLE_VERSION_PATTERN.test(version)) throw new Error('GitHub latest Codex tag is not stable');
  const asset = Array.isArray(value.assets)
    ? value.assets.find((item) => item?.name === 'codex-aarch64-apple-darwin.tar.gz')
    : null;
  const digest = typeof asset?.digest === 'string' ? asset.digest.match(/^sha256:([a-f0-9]{64})$/u) : null;
  if (!digest) throw new Error('Latest stable Codex arm64 asset has no trusted SHA-256 digest');
  return { assetName: asset.name, sha256: digest[1], version };
}

function compareVersions(pinned, latest) {
  const left = pinned.split('.').map(Number);
  const right = latest.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] < right[index]) return 'outdated';
    if (left[index] > right[index]) return 'ahead';
  }
  return 'current';
}

async function main() {
  const write = process.argv.includes('--write');
  const result = write ? await updateCodexHelperRelease() : await checkCodexHelperRelease();
  console.log(`[codex-helper] pinned=${result.pinned.version} latest=${result.latest.version} status=${result.status}`);
  if (!write && result.status !== 'current') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
