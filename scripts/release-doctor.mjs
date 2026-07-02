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
  manifestSignalStatus,
  parseArgs,
  runCommand
} from './release-doctor-core.mjs';

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

function checkManifest(manifest, version, phase) {
  const checks = [];
  const latestMatches = manifest.latest === version;
  checks.push(createCheck(
    manifestSignalStatus(phase, latestMatches),
    'manifest latest',
    latestMatches
      ? `manifest latest points to ${version}.`
      : `manifest latest is ${manifest.latest ?? '<missing>'}; phase=${phase}.`
  ));

  const releases = Array.isArray(manifest.releases) ? manifest.releases : [];
  const entry = releases.find((release) => release?.version === version);
  checks.push(createCheck(
    manifestSignalStatus(phase, Boolean(entry)),
    'manifest release entry',
    entry ? `manifest has a ${version} release entry.` : `manifest has no ${version} release entry; phase=${phase}.`
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
  const expectedBranch = `release/${version}`;
  const expectedTag = `v${version}`;
  const hasBranchGuard = workflowSource.includes('$expectedBranch = "release/$($package.version)"');
  const hasTagGuard = workflowSource.includes('$expectedTag = "v$($package.version)"');
  const hasRefInput = workflowSource.includes('release_ref:') && workflowSource.includes('ref: ${{ inputs.release_ref }}');
  const status = hasBranchGuard && hasTagGuard && hasRefInput ? 'PASS' : 'FAIL';
  return createCheck(
    status,
    'Windows release ref',
    status === 'PASS'
      ? `workflow accepts exact ${expectedBranch} or ${expectedTag}.`
      : 'workflow release_ref guard does not match the expected release branch/tag contract.'
  );
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

function parseGhJson(result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function classifyGhFailure(result) {
  if (result.error?.code === 'ENOENT') {
    return createCheck('SKIPPED', 'GitHub release remote', 'gh is not installed.');
  }
  const output = `${result.stderr ?? ''}\n${result.stdout ?? ''}`.toLowerCase();
  if (output.includes('authentication') || output.includes('not logged') || output.includes('login')) {
    return createCheck('SKIPPED', 'GitHub release remote', 'gh is not authenticated.');
  }
  return createCheck('UNKNOWN', 'GitHub release remote', `gh release check failed: ${(result.stderr || result.stdout || '').trim()}`);
}

function checkGithubRemote(version, phase, rootDir, commandRunner = runCommand) {
  const candidate = commandRunner('gh', [
    'release',
    'view',
    `v${version}`,
    '-R',
    'campfirium/foliole',
    '--json',
    'body,isDraft,tagName,url,assets'
  ], rootDir);
  if (candidate.error || candidate.status !== 0) {
    const missing = (candidate.stderr ?? '').toLowerCase().includes('not found');
    if (missing) {
      return [createCheck(
        phase === 'post' ? 'FAIL' : 'WARN',
        'GitHub release remote',
        `v${version} was not found on GitHub; phase=${phase}.`
      )];
    }
    return [classifyGhFailure(candidate)];
  }

  const candidateJson = parseGhJson(candidate);
  const checks = [
    createCheck(
      candidateJson?.tagName === `v${version}` ? 'PASS' : 'FAIL',
      'GitHub release tag',
      `GitHub release tag is ${candidateJson?.tagName ?? '<unknown>'}.`
    ),
    createCheck(
      phase === 'post' ? (candidateJson?.isDraft ? 'FAIL' : 'PASS') : (candidateJson?.isDraft ? 'PASS' : 'WARN'),
      'GitHub release draft',
      `GitHub release draft=${String(candidateJson?.isDraft)}; phase=${phase}.`
    )
  ];

  const latest = commandRunner('gh', [
    'release',
    'view',
    '-R',
    'campfirium/foliole',
    '--json',
    'tagName,isDraft,url'
  ], rootDir);
  if (latest.error || latest.status !== 0) {
    checks.push(createCheck('UNKNOWN', 'GitHub latest release', `latest release check failed: ${(latest.stderr || latest.stdout || '').trim()}`));
    return checks;
  }
  const latestJson = parseGhJson(latest);
  checks.push(createCheck(
    latestJson?.tagName === `v${version}` ? 'PASS' : (phase === 'post' ? 'FAIL' : 'WARN'),
    'GitHub latest release',
    `GitHub latest is ${latestJson?.tagName ?? '<unknown>'}; phase=${phase}.`
  ));
  return checks;
}

export async function collectReleaseDoctorChecks({
  argv = [],
  commandRunner = runCommand,
  rootDir = repoRoot
} = {}) {
  const args = parseArgs(argv);
  if (args.error) {
    return { checks: [createCheck('FAIL', 'phase option', args.error)], phase: args.phase };
  }
  const phase = args.phase;
  const packageJson = await readJsonFile(rootDir, 'package.json');
  const version = packageJson.version;
  const [manifest, enNotes, zhNotes, workflow] = await Promise.all([
    readJsonFile(rootDir, 'releases/update-manifest.json'),
    readJsonFile(rootDir, 'releases/notes/en.json'),
    readJsonFile(rootDir, 'releases/notes/zh-Hans.json'),
    readTextFile(rootDir, '.github/workflows/release-windows.yml')
  ]);
  const checks = [
    ...checkPackage(packageJson),
    await checkGithubBody(rootDir, version),
    checkNotesCatalog(enNotes, 'en', version),
    checkNotesCatalog(zhNotes, 'zh-Hans', version),
    ...checkManifest(manifest, version, phase),
    checkReleaseWorkflow(workflow, version),
    checkWorkingTree(rootDir, commandRunner),
    ...checkGithubRemote(version, phase, rootDir, commandRunner)
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
