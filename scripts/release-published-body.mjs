#!/usr/bin/env node
/* global console, process */

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { assertReleaseBodyPresentation } from './release-body-contract.mjs';
import { assertQualityCommandAllowed } from './quality/quality-command-contracts.mjs';

const RELEASE_FIELDS = 'assets,body,isDraft,isPrerelease,name,publishedAt,tagName,targetCommitish,url';

function json(command, args, cwd, run) {
  return JSON.parse(run(command, args, { cwd, encoding: 'utf8' }));
}

function stableReleaseIdentity(release) {
  return {
    assets: release.assets,
    isDraft: release.isDraft,
    isPrerelease: release.isPrerelease,
    name: release.name,
    publishedAt: release.publishedAt,
    tagName: release.tagName,
    targetCommitish: release.targetCommitish,
    url: release.url
  };
}

function normalizedBody(body) {
  return String(body ?? '').replaceAll('\r\n', '\n').trim();
}

export async function correctPublishedReleaseBody({ cwd = process.cwd(), run = execFileSync } = {}) {
  const [packageJson, intent, manifest] = await Promise.all([
    readFile(path.join(cwd, 'package.json'), 'utf8').then(JSON.parse),
    readFile(path.join(cwd, '.github/release-intent.json'), 'utf8').then(JSON.parse),
    readFile(path.join(cwd, 'releases/update-manifest.json'), 'utf8').then(JSON.parse)
  ]);
  const version = manifest.latest;
  if (!version || packageJson.version !== version || intent.version !== version) {
    throw new Error('package, release intent, and public manifest latest must identify one version.');
  }
  const manifestEntry = manifest.releases?.find((entry) => entry?.version === version);
  const tag = `v${version}`;
  const expectedUrl = `https://github.com/campfirium/foliole/releases/tag/${tag}`;
  if (manifestEntry?.url !== expectedUrl) throw new Error('public manifest must identify the correction target.');

  const bodyPath = path.join(cwd, `releases/github/${tag}.md`);
  const body = assertReleaseBodyPresentation(await readFile(bodyPath, 'utf8'));
  const before = json('gh', [
    'release', 'view', tag, '-R', 'campfirium/foliole', '--json', RELEASE_FIELDS
  ], cwd, run);
  if (before.tagName !== tag || before.isDraft || before.isPrerelease || !before.publishedAt || before.url !== expectedUrl) {
    throw new Error('body correction requires the matching published full Release.');
  }
  const latestBefore = json('gh', [
    'release', 'view', '-R', 'campfirium/foliole', '--json', 'tagName'
  ], cwd, run);
  if (latestBefore.tagName !== tag) throw new Error(`body correction requires GitHub Latest to remain ${tag}.`);

  const changed = normalizedBody(before.body) !== normalizedBody(body);
  if (changed) {
    run('gh', [
      'release', 'edit', tag, '-R', 'campfirium/foliole', '--notes-file', bodyPath
    ], { cwd, encoding: 'utf8' });
  }

  const after = json('gh', [
    'release', 'view', tag, '-R', 'campfirium/foliole', '--json', RELEASE_FIELDS
  ], cwd, run);
  const latestAfter = json('gh', [
    'release', 'view', '-R', 'campfirium/foliole', '--json', 'tagName'
  ], cwd, run);
  if (normalizedBody(after.body) !== normalizedBody(body)) throw new Error('published body does not match reviewed local copy.');
  if (JSON.stringify(stableReleaseIdentity(after)) !== JSON.stringify(stableReleaseIdentity(before))) {
    throw new Error('published Release identity changed during body correction.');
  }
  if (latestAfter.tagName !== latestBefore.tagName) throw new Error('Latest state changed during body correction.');
  return { changed, tag, url: after.url };
}

async function main() {
  assertQualityCommandAllowed('release-control:published-body', {
    owner: process.env.FOLIOLE_RELEASE_OWNER,
    state: process.env.FOLIOLE_RELEASE_STATE
  });
  const result = await correctPublishedReleaseBody();
  console.log(`[release-published-body] status: ${result.changed ? 'UPDATED' : 'ALREADY_CURRENT'} tag=${result.tag} url=${result.url}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await main().catch((error) => {
    console.error(`[release-published-body] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
