#!/usr/bin/env node
/* global console, fetch, process */

import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const LOCK_PATH = path.join(ROOT, 'build/macos/codex-helper-release.json');
const LATEST_RELEASE_API = 'https://api.github.com/repos/openai/codex/releases/latest';
const STABLE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;
const CODEX_ASSET_NAME = 'codex-aarch64-apple-darwin.tar.gz';
const CODE_MODE_HOST_ASSET_NAME = 'codex-code-mode-host-aarch64-apple-darwin.tar.gz';

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
  const status = versionStatus === 'current' && !releasesEqual(pinned, latest) ? 'mismatch' : versionStatus;
  return { latest, pinned, status };
}

export async function updateCodexHelperRelease(options = {}) {
  const result = await checkCodexHelperRelease(options);
  if (result.status === 'ahead') throw new Error('Pinned Codex version is newer than the latest official stable release');
  if (result.status === 'current') return result;
  await writePinnedReleaseAtomically(result.latest, options);
  return { ...result, pinned: result.latest, status: 'updated' };
}

export async function rollForwardCodexHelperRelease(releaseSnapshot, options = {}) {
  const latest = await fetchLatestStableCodexRelease(options.fetchImpl);
  const versionStatus = compareVersions(releaseSnapshot.version, latest.version);
  if (versionStatus === 'ahead') return { latest, status: 'ahead' };
  if (versionStatus === 'current') {
    const matches = releasesEqual(releaseSnapshot, latest);
    return { latest, status: matches ? 'current' : 'mismatch' };
  }
  await options.prepareRelease(latest);
  const current = await loadPinnedCodexHelperRelease(options.lockPath);
  if (!releasesEqual(current, releaseSnapshot)) return { latest, status: 'concurrent' };
  await writePinnedReleaseAtomically(latest, options);
  return { latest, status: 'updated' };
}

export async function bestEffortRollForwardCodexHelperRelease(releaseSnapshot, options = {}) {
  try {
    const result = await rollForwardCodexHelperRelease(releaseSnapshot, options);
    reportRollForwardResult(releaseSnapshot, result, options.logger ?? console);
    return result;
  } catch (error) {
    (options.logger ?? console).warn(
      `[codex-helper] next-build preparation skipped: ${error instanceof Error ? error.message : error}`
    );
    return { status: 'failed' };
  }
}

export async function runWithCodexHelperRollForward(releaseSnapshot, packageWork, options = {}) {
  const result = await packageWork();
  await bestEffortRollForwardCodexHelperRelease(releaseSnapshot, options);
  return result;
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
  const { version } = value;
  const codex = parsePinnedAsset(value, 'Codex helper');
  const codeModeHost = parsePinnedAsset(value.codeModeHost, 'Codex code-mode host');
  if (typeof version !== 'string' || !STABLE_VERSION_PATTERN.test(version)) throw new Error('Codex helper must pin a stable release');
  return { assetName: codex.assetName, codeModeHost, sha256: codex.sha256, version };
}

function parsePinnedAsset(value, label) {
  const { assetName, sha256 } = value ?? {};
  if (typeof assetName !== 'string' || !assetName.endsWith('.tar.gz')) throw new Error(`Invalid ${label} asset name`);
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(sha256)) throw new Error(`Invalid ${label} SHA-256`);
  return { assetName, sha256 };
}

function parseOfficialRelease(value) {
  if (!value || typeof value !== 'object' || value.draft || value.prerelease) {
    throw new Error('GitHub latest release is not an official stable Codex release');
  }
  const version = typeof value.tag_name === 'string' ? value.tag_name.replace(/^rust-v/u, '') : '';
  if (!STABLE_VERSION_PATTERN.test(version)) throw new Error('GitHub latest Codex tag is not stable');
  const codex = parseOfficialAsset(value.assets, CODEX_ASSET_NAME, 'Codex');
  const codeModeHost = parseOfficialAsset(value.assets, CODE_MODE_HOST_ASSET_NAME, 'Codex code-mode host');
  return { assetName: codex.assetName, codeModeHost, sha256: codex.sha256, version };
}

function parseOfficialAsset(assets, name, label) {
  const asset = Array.isArray(assets) ? assets.find((item) => item?.name === name) : null;
  const digest = typeof asset?.digest === 'string' ? asset.digest.match(/^sha256:([a-f0-9]{64})$/u) : null;
  if (!digest) throw new Error(`Latest stable ${label} arm64 asset has no trusted SHA-256 digest`);
  return { assetName: name, sha256: digest[1] };
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

function releasesEqual(left, right) {
  return left.version === right.version
    && assetsEqual(left, right) && assetsEqual(left.codeModeHost, right.codeModeHost);
}

function assetsEqual(left, right) {
  return left.assetName === right.assetName && left.sha256 === right.sha256;
}

async function writePinnedReleaseAtomically(release, options) {
  const lockPath = options.lockPath ?? LOCK_PATH;
  if (options.writeFileImpl) {
    await options.writeFileImpl(lockPath, `${JSON.stringify(release, null, 2)}\n`, 'utf8');
    return;
  }
  const temporaryPath = `${lockPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(release, null, 2)}\n`, 'utf8');
    await (options.renameImpl ?? rename)(temporaryPath, lockPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function reportRollForwardResult(snapshot, result, logger) {
  if (result.status === 'updated') {
    logger.log(`[codex-helper] build=${snapshot.version} prepared=${result.latest.version} for-next-build`);
  } else if (result.status === 'mismatch') {
    logger.warn(`[codex-helper] same-version digest mismatch for ${snapshot.version}; lock unchanged`);
  } else if (result.status === 'ahead') {
    logger.warn(`[codex-helper] pinned=${snapshot.version} is ahead of latest=${result.latest.version}; lock unchanged`);
  } else if (result.status === 'concurrent') {
    logger.log('[codex-helper] lock changed during packaging; concurrent update preserved');
  }
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
