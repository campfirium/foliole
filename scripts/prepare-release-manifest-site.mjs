#!/usr/bin/env node
/* global console, process */

import { cp, mkdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertQualityCommandAllowed } from './quality/quality-command-contracts.mjs';

const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function required(value, name) {
  const normalized = value?.trim() ?? '';
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

export function validateReleaseManifestPublication({ manifest, release, repository }) {
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
  const manifest = JSON.parse(await readFile(join(sourceRoot, 'update-manifest.json'), 'utf8'));
  const release = await fetchPublishedRelease({
    fetchImpl,
    repository: normalizedRepository,
    token,
    version: required(manifest.latest, 'manifest latest')
  });
  const publication = validateReleaseManifestPublication({ manifest, release, repository: normalizedRepository });
  await mkdir(dirname(outputRoot), { recursive: true });
  await cp(sourceRoot, outputRoot, { force: true, recursive: true });
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
