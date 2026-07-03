#!/usr/bin/env node
/* global console, process, setTimeout */

import { fileURLToPath } from 'node:url';

import { runGh } from './github-monitor-gh.mjs';
import {
  clearCoveredPending,
  loadBarrierState,
  markFailed,
  registerPending,
  isAncestorCommit
} from './t4-archive-barrier-state.mjs';

const DEFAULT_REPOSITORY = 'campfirium/foliole';
const DEFAULT_WORKFLOW = 'Branch Push Health';
const DEFAULT_BRANCH = 'dev';
const FAILURE_CONCLUSIONS = new Set(['failure', 'timed_out', 'action_required']);

function getArg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function listBranchPushHealthRuns(repository = DEFAULT_REPOSITORY) {
  return runGh([
    'run',
    'list',
    '--repo',
    repository,
    '--workflow',
    DEFAULT_WORKFLOW,
    '--branch',
    DEFAULT_BRANCH,
    '--limit',
    '20',
    '--json',
    'databaseId,conclusion,status,displayTitle,headSha,headBranch,url,workflowName,createdAt,updatedAt'
  ]);
}

export function resolveCommitAgainstRuns(commitSha, runs, isAncestor = isAncestorCommit) {
  for (const run of runs) {
    if (run.headBranch !== DEFAULT_BRANCH) continue;
    if (!isAncestor(commitSha, run.headSha)) continue;
    if (run.status !== 'completed') return { outcome: 'waiting', run };
    if (run.conclusion === 'success') return { outcome: 'passed', run };
    if (FAILURE_CONCLUSIONS.has(run.conclusion)) return { outcome: 'failed', run };
  }
  return { outcome: 'waiting', run: null };
}

async function waitForCommit(commitSha, args = {}) {
  const timeoutSeconds = Number(args.timeoutSeconds ?? 540);
  const pollSeconds = Number(args.pollSeconds ?? 30);
  const deadline = Date.now() + timeoutSeconds * 1000;
  for (;;) {
    const runs = listBranchPushHealthRuns(args.repository);
    const result = resolveCommitAgainstRuns(commitSha, runs);
    if (result.outcome === 'passed') {
      clearCoveredPending(result.run.headSha);
      return result;
    }
    if (result.outcome === 'failed') {
      markFailed(commitSha, result.run);
      return result;
    }
    if (Date.now() >= deadline) return { outcome: 'timeout', run: result.run };
    await new Promise((resolve) => setTimeout(resolve, pollSeconds * 1000));
  }
}

async function main() {
  const command = process.argv[2] ?? 'status';
  if (command === 'register') {
    const commitSha = getArg('--commit');
    if (!commitSha) throw new Error('register requires --commit <sha>');
    console.log(JSON.stringify(registerPending(commitSha, { threadId: getArg('--thread-id') }), null, 2));
    return;
  }
  if (command === 'wait') {
    const commitSha = getArg('--commit');
    if (!commitSha) throw new Error('wait requires --commit <sha>');
    const result = await waitForCommit(commitSha, {
      pollSeconds: getArg('--poll-sec', '30'),
      repository: getArg('--repo', DEFAULT_REPOSITORY),
      timeoutSeconds: getArg('--timeout-sec', '540')
    });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.outcome === 'passed' ? 0 : 1;
    return;
  }
  if (command === 'status') {
    console.log(JSON.stringify(loadBarrierState(), null, 2));
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
