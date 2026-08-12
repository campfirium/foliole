#!/usr/bin/env node
/* global console, process */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import {
  createCheck,
  formatReleaseDoctorReport,
  hasFailures,
  parseArgs,
  runCommand
} from './release-doctor-core.mjs';
import {
  checkGithubReleaseSignals,
  checkSiteSync,
  collectPostPublishChecks,
  fetchJson
} from './release-doctor-post-publish.mjs';
import {
  formatReleaseConfirmation,
  resolveReleasePlatformIdentity
} from './release-platform-contract.mjs';
import {
  assertPublishedManifestScope,
  assertT7Publication
} from './release-publication-contract.mjs';
import { checkReleaseMetadata } from './release-doctor-metadata.mjs';

export { formatReleaseDoctorReport, hasFailures } from './release-doctor-core.mjs';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function readJsonFile(rootDir, relativePath) {
  const source = await readFile(join(rootDir, relativePath), 'utf8');
  return JSON.parse(source);
}

async function readTextFile(rootDir, relativePath) {
  return readFile(join(rootDir, relativePath), 'utf8');
}

function expectedReleaseUrl(version) {
  return `https://github.com/campfirium/foliole/releases/tag/v${version}`;
}

function checkPackage(packageJson) {
  const version = packageJson.version;
  if (!version) {
    return [createCheck('FAIL', 'package version', 'package.json has no version.')];
  }
  return [createCheck('PASS', 'package version', `package.json version is ${version}.`)];
}

function checkManifest(manifest, version, identity) {
  const checks = [];
  const latestMatches = manifest.latest === version;
  checks.push(createCheck(
    latestMatches ? 'PASS' : 'FAIL',
    'manifest latest',
    latestMatches
      ? `manifest latest points to ${version}.`
      : `manifest latest is ${manifest.latest ?? '<missing>'}; post-public metadata is incomplete.`
  ));

  const releases = Array.isArray(manifest.releases) ? manifest.releases : [];
  const entry = releases.find((release) => release?.version === version);
  checks.push(createCheck(
    entry ? 'PASS' : 'FAIL',
    'manifest release entry',
    entry ? `manifest has a ${version} release entry.` : `manifest has no ${version} release entry.`
  ));

  if (entry?.url) {
    const expectedUrl = expectedReleaseUrl(version);
    checks.push(createCheck(
      entry.url === expectedUrl ? 'PASS' : 'FAIL',
      'manifest release url',
      entry.url === expectedUrl ? `manifest URL matches ${expectedUrl}.` : `manifest URL is ${entry.url}; expected ${expectedUrl}.`
    ));
  }
  try {
    assertPublishedManifestScope({ identity, manifest });
    checks.push(createCheck('PASS', 'manifest release platforms', 'manifest platforms match release intent.'));
  } catch (error) {
    checks.push(createCheck('FAIL', 'manifest release platforms', error.message));
  }
  return checks;
}

function checkReleaseWorkflow(workflowSource, version) {
  const exactBranch = workflowSource.includes('- release') &&
    workflowSource.includes('FOLIOLE_RELEASE_REF_NAME: ${{ github.ref_name }}');
  const branchVersion = workflowSource.includes('node scripts/release-target-contract.mjs');
  const internalIdentity = workflowSource.includes('FOLIOLE_RELEASE_RUN_SHA: ${{ github.sha }}');
  const frozenIntent = workflowSource.includes('FOLIOLE_RELEASE_EXPECTED_INTENT_DIGEST');
  const publicationPolicy = workflowSource.includes('FOLIOLE_RELEASE_REQUIRE_PUBLICATION_MODE');
  const noManualEntry = !workflowSource.includes('workflow_dispatch:');
  const status = exactBranch && branchVersion && internalIdentity && frozenIntent && publicationPolicy && noManualEntry
    ? 'PASS' : 'FAIL';
  return createCheck(
    status,
    'T7 release identity',
    status === 'PASS'
      ? `exact release freezes version ${version}, platform intent, and event commit identity.`
      : 'T7 must freeze branch version, platform intent, and event commit identity without manual identity input.'
  );
}

function resolvePlatformIdentity(packageJson, registry, intent) {
  try {
    const identity = resolveReleasePlatformIdentity({
      registry, intent, packageVersion: packageJson.version, sha: 'release-doctor'
    });
    return {
      check: createCheck('PASS', 'platform release identity', formatReleaseConfirmation(identity).replaceAll('\n', '; ')),
      identity
    };
  } catch (error) {
    return {
      check: createCheck('FAIL', 'platform release identity', error instanceof Error ? error.message : String(error)),
      identity: null
    };
  }
}

function checkReleasePublication(identity, manifest) {
  try {
    const publication = assertT7Publication(identity, manifest);
    return createCheck(
      'PASS',
      'release publication mode',
      `${publication.mode} publication is valid before T7.`
    );
  } catch (error) {
    return createCheck(
      'FAIL',
      'release publication mode',
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function collectPostPublicMetadataChecks(rootDir, version, identity) {
  const [manifest, enNotes, zhNotes] = await Promise.all([
    readJsonFile(rootDir, 'releases/update-manifest.json'),
    readJsonFile(rootDir, 'releases/notes/en.json'),
    readJsonFile(rootDir, 'releases/notes/zh-Hans.json')
  ]);
  return [
    ...(await checkReleaseMetadata({ enNotes, identity, rootDir, version, zhNotes })),
    ...checkManifest(manifest, version, identity)
  ];
}

function checkWorkingTree(rootDir, commandRunner = runCommand) {
  const result = commandRunner('git', ['status', '--porcelain'], rootDir);
  if (result.error) {
    return createCheck('UNKNOWN', 'working tree', `git status unavailable: ${result.error.message}`);
  }
  if (result.status !== 0) {
    return createCheck('UNKNOWN', 'working tree', `git status failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  const changed = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  if (changed.length === 0) {
    return createCheck('PASS', 'working tree', 'working tree is clean.');
  }
  return createCheck('WARN', 'working tree', `working tree has ${changed.length} changed path(s).`);
}

export async function collectReleaseDoctorChecks({
  argv = [],
  commandRunner = runCommand,
  fetcher,
  marketingRoot,
  rootDir = repoRoot
} = {}) {
  const args = parseArgs(argv);
  if (args.error) {
    return { checks: [createCheck('FAIL', 'phase option', args.error)], phase: args.phase };
  }
  const phase = args.phase;
  const [packageJson, platformRegistry, releaseIntent, manifest] = await Promise.all([
    readJsonFile(rootDir, 'package.json'),
    readJsonFile(rootDir, '.github/release-platforms.json'),
    readJsonFile(rootDir, '.github/release-intent.json'),
    readJsonFile(rootDir, 'releases/update-manifest.json')
  ]);
  const version = packageJson.version;
  const platform = resolvePlatformIdentity(packageJson, platformRegistry, releaseIntent);
  const workflow = await readTextFile(rootDir, '.github/workflows/t7-release.yml');
  const metadataChecks = phase === 'post' && platform.identity
    ? await collectPostPublicMetadataChecks(rootDir, version, platform.identity)
    : [];
  const bodyPath = join(rootDir, `releases/github/v${version}.md`);
  const localBody = phase === 'post' && existsSync(bodyPath)
    ? await readTextFile(rootDir, `releases/github/v${version}.md`)
    : '';
  const siteChecks = phase === 'post'
    ? await checkSiteSync(version, rootDir, commandRunner, fetcher ?? fetchJson)
    : [];
  const checks = [
    ...checkPackage(packageJson),
    platform.check,
    ...(phase === 'pre' && platform.identity
      ? [checkReleasePublication(platform.identity, manifest)]
      : []),
    ...metadataChecks,
    checkReleaseWorkflow(workflow, version),
    checkWorkingTree(rootDir, commandRunner),
    ...(platform.identity ? checkGithubReleaseSignals({
      commandRunner, identity: platform.identity, localBody, phase, rootDir, version
    }) : []),
    ...siteChecks,
    ...(platform.identity
      ? await collectPostPublishChecks({ fetcher, identity: platform.identity, marketingRoot, phase, version })
      : [])
  ];
  return { checks, phase, version };
}

async function main() {
  const result = await collectReleaseDoctorChecks({ argv: process.argv.slice(2) });
  console.log(formatReleaseDoctorReport(result));
  process.exitCode = hasFailures(result.checks) ? 1 : 0;
}

if (basename(process.argv[1] ?? '') === 'release-doctor.mjs') {
  await main();
}
