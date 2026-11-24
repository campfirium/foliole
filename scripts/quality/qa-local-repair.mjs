import { execFileSync, spawnSync } from 'node:child_process';

import { qaGit, readQaWorkspace } from './qa-workspace-state.mjs';
import { saveQaRecord } from './qa-workspace-integration.mjs';
import { isTestOnlyFile } from './test-only-files.mjs';

export { isTestOnlyFile };

// A test-only repair of a completed full run is proven locally instead of by another full hosted run.
export const LOCAL_REPAIR_REPEATS = 3;
const AGGREGATE_JOB = /admission|verdict/iu;
const FAILED_TEST = /\[vitest-summary\] fail \d+\. (\S+) :: /u;
const REPO_PATH = /(?:^|\/)((?:src|scripts|electron|lib|tests|android|ios)\/\S+)$/u;

export function failedTestsByJob(failedLog) {
  const byJob = new Map();
  for (const line of failedLog.split('\n')) {
    const [job] = line.split('\t');
    const match = FAILED_TEST.exec(line);
    const file = match ? REPO_PATH.exec(match[1].replaceAll('\\', '/'))?.[1] : null;
    if (!job || !file) continue;
    if (!byJob.has(job)) byJob.set(job, new Set());
    byJob.get(job).add(file);
  }
  return byJob;
}

function defaultGh(args, cwd) {
  return execFileSync('gh', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function repositoryOf(record, gh) {
  return gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], record.worktreePath).trim();
}

function isAncestor(cwd, before, after) {
  return spawnSync('git', ['-C', cwd, 'merge-base', '--is-ancestor', before, after]).status === 0;
}

/** Reads the base run and proves its only failures are test files that the repair changed. */
export function readLocalRepairBase({ record, baseRunId, gh = defaultGh }) {
  const repository = repositoryOf(record, gh);
  const run = JSON.parse(gh(['api', `repos/${repository}/actions/runs/${baseRunId}`], record.worktreePath));
  if (run.status !== 'completed' || run.head_branch !== record.branch) {
    throw new Error('Local repair needs a completed hosted run on the QA branch');
  }
  const baseSha = run.head_sha;
  if (!isAncestor(record.worktreePath, baseSha, record.head)) throw new Error('Base run is not in the QA history');
  const pages = JSON.parse(gh(['api', '--paginate', '--slurp',
    `repos/${repository}/actions/runs/${baseRunId}/jobs?per_page=100`], record.worktreePath));
  const jobs = pages.flatMap(page => page.jobs ?? []);
  if (jobs.some(job => !['success', 'skipped', 'failure'].includes(job.conclusion))) {
    throw new Error('Base run has incomplete or cancelled jobs; its coverage cannot be reused');
  }
  const failedJobs = jobs.filter(job => job.conclusion === 'failure' && !AGGREGATE_JOB.test(job.name));
  if (failedJobs.length === 0) throw new Error('Base run has no repairable test failure; use its full evidence instead');
  const byJob = failedTestsByJob(gh(['run', 'view', String(baseRunId), '--repo', repository, '--log-failed'],
    record.worktreePath));
  const failedTests = new Set();
  for (const job of failedJobs) {
    const files = [...byJob.entries()].find(([name]) => job.name.endsWith(name) || name.endsWith(job.name))?.[1];
    if (!files?.size) throw new Error(`Failed job ${job.name} has no attributable test failure`);
    for (const file of files) failedTests.add(file);
  }
  const changed = qaGit(record.worktreePath, 'diff', '--name-only', `${baseSha}..${record.head}`)
    .split('\n').filter(Boolean);
  const product = changed.filter(file => !isTestOnlyFile(file));
  if (product.length) throw new Error(`Local repair only covers test files; changed: ${product.join(', ')}`);
  const unrepaired = [...failedTests].filter(file => !changed.includes(file));
  if (unrepaired.length) throw new Error(`Failed tests were not repaired: ${unrepaired.join(', ')}`);
  return { baseSha, changed, failedTests: [...failedTests].sort(), url: run.html_url };
}

/** Records local-repair evidence after the changed tests pass repeatedly and their static checks pass. */
export async function recordLocalRepair({ repoRoot, baseRunId, runLocal, gh = defaultGh,
  repeats = LOCAL_REPAIR_REPEATS }) {
  const record = readQaWorkspace(repoRoot);
  if (record.phase !== 'prepared') throw new Error('Local repair requires the prepared QA workspace');
  if (qaGit(record.worktreePath, 'status', '--porcelain', '--untracked-files=all')) {
    throw new Error('Commit the repair before recording local evidence');
  }
  const base = readLocalRepairBase({ record, baseRunId, gh });
  const tests = base.changed.filter(file => /\.test\.[cm]?[jt]sx?$/u.test(file));
  const code = file => /\.[cm]?[jt]sx?$/u.test(file);
  const checks = [
    ['npx', 'eslint', ...base.changed.filter(code)],
    ['npm', 'run', 'typecheck:desktop:raw'],
    ...Array.from({ length: tests.length ? repeats : 0 }, () => ['npm', 'run', 'test:sqlite:electron', '--', ...tests])
  ];
  for (const command of checks) {
    if (await runLocal(command) !== 0) throw new Error(`Local repair check failed: ${command.join(' ')}`);
  }
  record.run = { runId: Number(baseRunId), url: base.url, scope: 'local-repair', baseSha: base.baseSha,
    targetSha: record.head, failedTests: base.failedTests, repairedFiles: base.changed, localRepeats: repeats,
    passed: true };
  saveQaRecord(record);
  return record.run;
}

/** Rechecks recorded local-repair evidence against the current QA tip. */
export function verifyLocalRepairRun(record, gh = defaultGh) {
  const base = readLocalRepairBase({ record, baseRunId: record.run.runId, gh });
  if (base.baseSha !== record.run.baseSha || record.run.targetSha !== record.head) {
    throw new Error('Local repair evidence no longer matches the QA tip');
  }
}
