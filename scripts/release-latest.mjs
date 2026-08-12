#!/usr/bin/env node
/* global console, process */

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { assertQualityCommandAllowed } from './quality/quality-command-contracts.mjs';

function json(command, args, cwd, run) {
  return JSON.parse(run(command, args, { cwd, encoding: 'utf8' }));
}

export async function markManifestLatestRelease({ cwd = process.cwd(), run = execFileSync } = {}) {
  const [packageJson, intent, manifest] = await Promise.all([
    readFile(path.join(cwd, 'package.json'), 'utf8').then(JSON.parse),
    readFile(path.join(cwd, '.github/release-intent.json'), 'utf8').then(JSON.parse),
    readFile(path.join(cwd, 'releases/update-manifest.json'), 'utf8').then(JSON.parse)
  ]);
  const version = manifest.latest;
  if (!version || packageJson.version !== version || intent.version !== version) {
    throw new Error('package, release intent, and public manifest latest must identify one version.');
  }
  const tag = `v${version}`;
  const release = json('gh', [
    'release', 'view', tag, '-R', 'campfirium/foliole',
    '--json', 'isDraft,isPrerelease,publishedAt,tagName,url'
  ], cwd, run);
  if (release.tagName !== tag || release.isDraft || release.isPrerelease || !release.publishedAt) {
    throw new Error('Latest correction requires the matching published full Release.');
  }
  const before = json('gh', [
    'release', 'view', '-R', 'campfirium/foliole', '--json', 'tagName'
  ], cwd, run);
  if (before.tagName !== tag) {
    run('gh', [
      'release', 'edit', tag, '-R', 'campfirium/foliole', '--latest=true'
    ], { cwd, encoding: 'utf8' });
  }
  const after = json('gh', [
    'release', 'view', '-R', 'campfirium/foliole', '--json', 'tagName'
  ], cwd, run);
  if (after.tagName !== tag) throw new Error(`GitHub Latest must be ${tag}.`);
  return { changed: before.tagName !== tag, tag };
}

async function main() {
  assertQualityCommandAllowed('release-control:latest', {
    owner: process.env.FOLIOLE_RELEASE_OWNER,
    state: process.env.FOLIOLE_RELEASE_STATE
  });
  const result = await markManifestLatestRelease();
  console.log(`[release-latest] status: ${result.changed ? 'UPDATED' : 'ALREADY_CURRENT'} tag=${result.tag}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await main().catch((error) => {
    console.error(`[release-latest] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
