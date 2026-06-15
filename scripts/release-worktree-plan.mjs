#!/usr/bin/env node
/* global console, process */

import { fileURLToPath } from 'node:url';

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/iu;

export function parseReleaseWorktreeArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--version' || arg === '--candidate' || arg === '--worktree') {
      options[arg.slice(2)] = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--help') {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function createReleaseWorktreePlan({ version, candidate, worktree }) {
  const normalizedVersion = normalizeVersion(version);
  const normalizedCandidate = normalizeCandidate(candidate);
  const worktreePath = worktree?.trim() || `../foliole-release-${normalizedVersion}`;
  const branchName = `release/${normalizedVersion}`;

  return {
    version: normalizedVersion,
    candidate: normalizedCandidate,
    branchName,
    worktreePath,
    create: `git worktree add ${worktreePath} -b ${branchName} ${normalizedCandidate}`,
    initialize: [`cd ${worktreePath}`, 'npm ci', 'npm run electron:rebuild:native'],
    releaseRef: `v${normalizedVersion}`,
    cleanup: [
      `git worktree remove ${worktreePath}`,
      `git branch -D ${branchName}`,
    ],
    constraints: [
      'Do not create original commits on the release branch.',
      'Cherry-pick required fixes from dev only after they pass validation on dev.',
      'Do not merge dev into release or release into dev.',
    ],
  };
}

export function formatReleaseWorktreePlan(plan) {
  return [
    `[release-worktree] version=${plan.version}`,
    `[release-worktree] candidate=${plan.candidate}`,
    `[release-worktree] branch=${plan.branchName}`,
    `[release-worktree] worktree=${plan.worktreePath}`,
    '',
    '# create fixed release worktree',
    plan.create,
    '',
    '# initialize isolated dependencies and native modules',
    ...plan.initialize,
    '',
    '# bind release workflow to fixed tag/ref after tagging the candidate',
    `git tag ${plan.releaseRef}`,
    `# GitHub release workflow input: release_ref=${plan.releaseRef}`,
    '',
    '# cleanup after publish or abandonment',
    ...plan.cleanup,
    '',
    '# constraints',
    ...plan.constraints.map((line) => `- ${line}`),
  ].join('\n');
}

function normalizeVersion(version) {
  const normalized = version?.trim();
  if (!normalized || !VERSION_PATTERN.test(normalized)) {
    throw new Error('Expected --version x.y.z.');
  }
  return normalized;
}

function normalizeCandidate(candidate) {
  const normalized = candidate?.trim();
  if (!normalized) {
    throw new Error('Expected --candidate <dev-candidate-sha>.');
  }
  if (!COMMIT_SHA_PATTERN.test(normalized)) {
    throw new Error('Candidate must be an explicit dev candidate commit SHA, not a moving branch ref.');
  }
  return normalized;
}

function printHelp() {
  console.log([
    'Usage: node scripts/release-worktree-plan.mjs --version x.y.z --candidate <dev-candidate-sha> [--worktree ../foliole-release-x.y.z]',
    '',
    'Prints the release worktree create, initialization, fixed-ref, and cleanup commands.',
  ].join('\n'));
}

function main() {
  const options = parseReleaseWorktreeArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const plan = createReleaseWorktreePlan(options);
  console.log(formatReleaseWorktreePlan(plan));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(`[release-worktree] ${error.message}`);
    process.exitCode = 1;
  }
}
