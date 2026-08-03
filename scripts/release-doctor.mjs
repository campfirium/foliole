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
  collectPostPublishChecks
} from './release-doctor-post-publish.mjs';

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

async function checkGithubBody(rootDir, version) {
  const relativePath = `releases/github/v${version}.md`;
  if (!existsSync(join(rootDir, relativePath))) {
    return createCheck('FAIL', 'GitHub release body', `${relativePath} is missing.`);
  }
  const body = await readTextFile(rootDir, relativePath);
  if (body.trim().length === 0) {
    return createCheck('FAIL', 'GitHub release body', `${relativePath} is empty.`);
  }
  return createCheck('PASS', 'GitHub release body', `${relativePath} exists.`);
}

function checkNotesCatalog(catalog, locale, version) {
  const entry = catalog[version];
  if (!entry) {
    return createCheck('FAIL', `${locale} release notes`, `${locale} catalog has no ${version} entry.`);
  }
  if (!Array.isArray(entry.notes) || entry.notes.length === 0) {
    return createCheck('FAIL', `${locale} release notes`, `${locale} ${version} notes are empty.`);
  }
  return createCheck('PASS', `${locale} release notes`, `${locale} ${version} notes contain ${entry.notes.length} item(s).`);
}

function checkManifest(manifest, version) {
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
  return checks;
}

function checkReleaseWorkflow(workflowSource, version) {
  const exactBranch = workflowSource.includes('- release') &&
    workflowSource.includes('FOLIOLE_RELEASE_REF_NAME: ${{ github.ref_name }}');
  const branchVersion = workflowSource.includes('node scripts/release-target-contract.mjs');
  const internalIdentity = workflowSource.includes('FOLIOLE_RELEASE_RUN_SHA: ${{ github.sha }}');
  const noManualEntry = !workflowSource.includes('workflow_dispatch:');
  const status = exactBranch && branchVersion && internalIdentity && noManualEntry ? 'PASS' : 'FAIL';
  return createCheck(
    status,
    'T7 release identity',
    status === 'PASS'
      ? `exact release derives version ${version} from branch content and commit identity from its event.`
      : 'T7 must derive version from exact release branch content without a manual version or SHA entry.'
  );
}

async function collectPostPublicMetadataChecks(rootDir, version) {
  const [manifest, enNotes, zhNotes] = await Promise.all([
    readJsonFile(rootDir, 'releases/update-manifest.json'),
    readJsonFile(rootDir, 'releases/notes/en.json'),
    readJsonFile(rootDir, 'releases/notes/zh-Hans.json')
  ]);
  return [
    await checkGithubBody(rootDir, version),
    checkNotesCatalog(enNotes, 'en', version),
    checkNotesCatalog(zhNotes, 'zh-Hans', version),
    ...checkManifest(manifest, version)
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
  const packageJson = await readJsonFile(rootDir, 'package.json');
  const version = packageJson.version;
  const workflow = await readTextFile(rootDir, '.github/workflows/t7-release.yml');
  const metadataChecks = phase === 'post'
    ? await collectPostPublicMetadataChecks(rootDir, version)
    : [];
  const bodyPath = join(rootDir, `releases/github/v${version}.md`);
  const localBody = phase === 'post' && existsSync(bodyPath)
    ? await readTextFile(rootDir, `releases/github/v${version}.md`)
    : '';
  const checks = [
    ...checkPackage(packageJson),
    ...metadataChecks,
    checkReleaseWorkflow(workflow, version),
    checkWorkingTree(rootDir, commandRunner),
    ...checkGithubReleaseSignals(version, phase, rootDir, commandRunner, localBody),
    ...(phase === 'post' ? checkSiteSync(version, rootDir, commandRunner) : []),
    ...(await collectPostPublishChecks({ fetcher, marketingRoot, phase, version }))
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
