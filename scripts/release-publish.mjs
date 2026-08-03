#!/usr/bin/env node
/* global console, process */

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { assertExactReleaseAssets } from './release-asset-contract.mjs';
import { resolveReleasePlatformIdentity } from './release-platform-contract.mjs';
import { assertT7Publication } from './release-publication-contract.mjs';
import { assertQualityCommandAllowed } from './quality/quality-command-contracts.mjs';

function json(command, args, cwd, run) {
  return JSON.parse(run(command, args, { cwd, encoding: 'utf8' }));
}

export async function publishRelease({ cwd = process.cwd(), run = execFileSync } = {}) {
  const branch = run('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' }).trim();
  if (branch !== 'release') throw new Error('public transition requires the exact release branch.');
  const sha = run('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  const [packageJson, registry, intent, manifest] = await Promise.all([
    readFile(path.join(cwd, 'package.json'), 'utf8').then(JSON.parse),
    readFile(path.join(cwd, '.github/release-platforms.json'), 'utf8').then(JSON.parse),
    readFile(path.join(cwd, '.github/release-intent.json'), 'utf8').then(JSON.parse),
    readFile(path.join(cwd, 'releases/update-manifest.json'), 'utf8').then(JSON.parse)
  ]);
  const identity = resolveReleasePlatformIdentity({
    registry, intent, packageVersion: packageJson.version, sha
  });
  const publication = assertT7Publication(identity, manifest);
  const tag = `v${identity.intent.version}`;
  const candidate = json('gh', [
    'release', 'view', tag, '-R', 'campfirium/foliole',
    '--json', 'assets,isDraft,tagName,targetCommitish'
  ], cwd, run);
  if (candidate.tagName !== tag || candidate.isDraft !== true || candidate.targetCommitish !== sha) {
    throw new Error('public transition requires the frozen unpublished Draft at release HEAD.');
  }
  assertExactReleaseAssets(identity, candidate.assets.map((asset) => asset.name));
  run('gh', [
    'release', 'edit', tag, '-R', 'campfirium/foliole', '--draft=false',
    `--latest=${publication.makeLatest}`
  ], { cwd, encoding: 'utf8' });
  const published = json('gh', [
    'release', 'view', tag, '-R', 'campfirium/foliole', '--json', 'isDraft,tagName'
  ], cwd, run);
  const latest = json('gh', [
    'release', 'view', '-R', 'campfirium/foliole', '--json', 'tagName'
  ], cwd, run);
  const expectedLatest = publication.makeLatest ? tag : `v${publication.bridgeVersion}`;
  if (published.isDraft || published.tagName !== tag || latest.tagName !== expectedLatest) {
    throw new Error(`published Release must preserve repository latest at ${expectedLatest}.`);
  }
  return { expectedLatest, tag };
}

async function main() {
  assertQualityCommandAllowed('release-control:publish', {
    owner: process.env.FOLIOLE_RELEASE_OWNER,
    state: process.env.FOLIOLE_RELEASE_STATE
  });
  const result = await publishRelease();
  console.log(`[release-publish] status: PUBLISHED tag=${result.tag} latest=${result.expectedLatest}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await main().catch((error) => {
    console.error(`[release-publish] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
