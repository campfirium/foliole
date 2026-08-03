#!/usr/bin/env node
/* global console, process */

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertQualityCommandAllowed } from './quality/quality-command-contracts.mjs';
import { validatePublishedDesktopUpdaterPolicy } from './desktop-update-release-policy.mjs';
import {
  assertPublishedRecordMapImmutable,
  assertPublishedReleaseHistoryImmutable,
  resolveReleasePlatformIdentity
} from './release-platform-contract.mjs';
import { assertPublishedManifestScope } from './release-publication-contract.mjs';
import { assertExactReleaseAssets } from './release-asset-contract.mjs';
import {
  createPlatformDownloadDirectory,
  listPlatformDownloadVersions
} from './release-download-directory.mjs';
import { assertLocalizedReleaseNotesScope } from './release-notes-contract.mjs';

const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function required(value, name) {
  const normalized = value?.trim() ?? '';
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

export function validateReleaseManifestPublication({ enNotes, intent, manifest, previousManifest, registry, release, repository, zhNotes }) {
  const version = required(manifest?.latest, 'manifest latest');
  if (!VERSION.test(version)) throw new Error('manifest latest must be a valid version.');
  const entry = Array.isArray(manifest?.releases)
    ? manifest.releases.find((candidate) => candidate?.version === version)
    : null;
  const expectedTag = `v${version}`;
  const expectedUrl = `https://github.com/${repository}/releases/tag/${expectedTag}`;
  if (entry?.url !== expectedUrl) throw new Error(`manifest latest must link to ${expectedUrl}.`);
  if (release?.tag_name !== expectedTag || release?.draft !== false || !release?.published_at) {
    throw new Error(`${expectedTag} must be an already-published GitHub Release.`);
  }
  const identity = resolveReleasePlatformIdentity({
    registry, intent, packageVersion: version, sha: release.target_commitish ?? 'published-release'
  });
  assertPublishedManifestScope({ identity, manifest, previousManifest });
  assertExactReleaseAssets(identity, (release.assets ?? []).map((asset) => asset?.name ?? ''));
  assertLocalizedReleaseNotesScope({ en: enNotes, 'zh-Hans': zhNotes }, identity, version);
  if (previousManifest) assertPublishedReleaseHistoryImmutable(previousManifest, manifest);
  const pendingFirstBaseline = version === '0.7.1' &&
    manifest.desktopUpdater?.firstCapableVersion === null &&
    manifest.desktopUpdater?.verifiedBaselineVersion === null;
  if (!pendingFirstBaseline) validatePublishedDesktopUpdaterPolicy(manifest);
  return { expectedTag, version };
}

export async function fetchPublishedRelease({ fetchImpl = globalThis.fetch, repository, token, version }) {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/releases/tags/v${encodeURIComponent(version)}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-GitHub-Api-Version': '2026-03-10'
    }
  });
  if (!response.ok) throw new Error(`published Release lookup failed with HTTP ${response.status}.`);
  return response.json();
}

export async function prepareReleaseManifestSite({
  fetchImpl,
  outputRoot = '_site/releases',
  ref = process.env.GITHUB_REF,
  repository = process.env.GITHUB_REPOSITORY,
  sourceRoot = 'releases',
  token = process.env.GITHUB_TOKEN
} = {}) {
  if (required(ref, 'GitHub ref') !== 'refs/heads/dev') {
    throw new Error('Release manifest Pages output may only be prepared from dev.');
  }
  const normalizedRepository = required(repository, 'GitHub repository');
  if (!/^[^/\s]+\/[^/\s]+$/u.test(normalizedRepository)) throw new Error('GitHub repository must use owner/name.');
  const [manifest, enNotes, zhNotes, registry, intent] = await Promise.all([
    readFile(join(sourceRoot, 'update-manifest.json'), 'utf8').then(JSON.parse),
    readFile(join(sourceRoot, 'notes/en.json'), 'utf8').then(JSON.parse),
    readFile(join(sourceRoot, 'notes/zh-Hans.json'), 'utf8').then(JSON.parse),
    readFile('.github/release-platforms.json', 'utf8').then(JSON.parse),
    readFile('.github/release-intent.json', 'utf8').then(JSON.parse)
  ]);
  const previous = (path) => JSON.parse(execFileSync('git', ['show', `HEAD^:${path}`], { encoding: 'utf8' }));
  const previousManifest = previous('releases/update-manifest.json');
  assertPublishedRecordMapImmutable(previous('releases/notes/en.json'), enNotes, 'en release notes');
  assertPublishedRecordMapImmutable(previous('releases/notes/zh-Hans.json'), zhNotes, 'zh-Hans release notes');
  const release = await fetchPublishedRelease({
    fetchImpl,
    repository: normalizedRepository,
    token,
    version: required(manifest.latest, 'manifest latest')
  });
  const publication = validateReleaseManifestPublication({
    enNotes, intent, manifest, previousManifest, registry, release, repository: normalizedRepository, zhNotes
  });
  const versions = listPlatformDownloadVersions(manifest, registry);
  const publishedReleases = Object.fromEntries(await Promise.all(versions.map(async (version) => [
    version,
    version === publication.version ? release : await fetchPublishedRelease({
      fetchImpl, repository: normalizedRepository, token, version
    })
  ])));
  const downloads = createPlatformDownloadDirectory({
    manifest, publishedReleases, registry, repository: normalizedRepository
  });
  await mkdir(dirname(outputRoot), { recursive: true });
  await cp(sourceRoot, outputRoot, { force: true, recursive: true });
  await writeFile(join(outputRoot, 'downloads.json'), `${JSON.stringify(downloads, null, 2)}\n`);
  return publication;
}

async function main() {
  assertQualityCommandAllowed('runner:release-manifest-pages');
  const result = await prepareReleaseManifestSite();
  console.log(`[release-manifest-pages] status: PREPARED version=${result.version}`);
}

if (basename(process.argv[1] ?? '') === basename(fileURLToPath(import.meta.url))) {
  await main().catch((error) => {
    console.error(`[release-manifest-pages] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
