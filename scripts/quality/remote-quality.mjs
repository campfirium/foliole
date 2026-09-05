/* global console, process, setTimeout */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { assertQualityCommandAllowed } from './quality-command-contracts.mjs';

const ALLOWED_SCOPES = new Set(['android', 'desktop', 'full', 'ios', 'shared']);
const ACTIVE_RUN_STATUSES = new Set(['in_progress', 'pending', 'queued', 'requested', 'waiting']);
const PASSING_JOB_CONCLUSIONS = new Set(['neutral', 'skipped', 'success']);
const POLL_INTERVAL_MS = 15_000;
const QUALITY_WORKFLOWS = ['remote-quality.yml', 't7-hosted-quality.yml'];

export function parseRemoteQualityArgs(args) {
  const result = { scope: '' };
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === '--scope') {
      result[name.slice(2)] = args[index + 1] ?? '';
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${name}`);
    }
  }
  if (!ALLOWED_SCOPES.has(result.scope)) {
    throw new Error('--scope must be desktop, shared, android, ios, or full');
  }
  return result;
}

async function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const capture = options.capture !== false;
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: capture ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit']
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
      child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
      child.stdin.end(options.input ?? '');
    }
    child.on('error', (error) => resolve({ code: 1, stderr: error.message, stdout }));
    child.on('exit', (code) => resolve({ code: code ?? 1, stderr, stdout }));
  });
}

async function requireSuccess(runner, command, args, options = {}) {
  const result = await runner(command, args, options);
  if (result.code !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`.trim());
  }
  return result.stdout.trim();
}

async function dispatchWorkflow(runner, args, options) {
  const result = await runner('gh', args, options);
  if (result.code === 0) return result.stdout.trim();
  const details = (result.stderr || result.stdout).trim();
  if (/\b403\b|forbidden|resource not accessible/iu.test(details)) {
    throw new Error(`GitHub Actions write permission is required to dispatch Remote Quality: ${details}`);
  }
  throw new Error(`gh ${args.join(' ')} failed: ${details}`.trim());
}

function parseJobs(value) {
  const parsed = JSON.parse(value);
  const pages = Array.isArray(parsed) ? parsed : [parsed];
  if (pages.some((page) => !Array.isArray(page.jobs))) {
    throw new Error('GitHub jobs response did not contain a jobs array');
  }
  return pages.flatMap((page) => page.jobs);
}

function parseWorkflowRun(value) {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('GitHub workflow run response was not an object');
  }
  return parsed;
}

function parseWorkflowRuns(value) {
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed.workflow_runs)) {
    throw new Error('GitHub workflow runs response did not contain a workflow_runs array');
  }
  return parsed.workflow_runs;
}

function parseRemoteDevSha(value) {
  const sha = value.trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error('Remote dev HEAD did not resolve to a full 40-character lowercase commit SHA');
  }
  return sha;
}

export function findActiveHostedQualityRuns(workflowRuns, branch) {
  return workflowRuns.flat().filter((run) => (
    run.head_branch === branch && ACTIVE_RUN_STATUSES.has(run.status)
  ));
}

async function requireHostedQualityIdle(runner, repo, branch, cwd) {
  const responses = await Promise.all(QUALITY_WORKFLOWS.map((workflow) => requireSuccess(
    runner,
    'gh',
    ['api', '-H', 'X-GitHub-Api-Version: 2026-03-10',
      `repos/${repo}/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(branch)}&per_page=30`],
    { cwd }
  )));
  const activeRuns = findActiveHostedQualityRuns(responses.map(parseWorkflowRuns), branch);
  if (activeRuns.length === 0) return;
  const details = activeRuns
    .map((run) => `${run.name ?? 'hosted quality'} #${run.run_number ?? run.id} ${run.status} ${run.html_url ?? ''}`.trim())
    .join('\n');
  throw new Error(`A T7 Hosted Quality or Remote Quality run is still active; wait for every job to reach a terminal state before dispatching another run:\n${details}`);
}

function isFailedJob(job) {
  return job.status === 'completed' && !PASSING_JOB_CONCLUSIONS.has(job.conclusion);
}

async function emitFailedJobLog(runner, repo, job, cwd) {
  console.error(`[remote-quality] failed job: ${job.name} (${job.html_url ?? job.id})`);
  return runner('gh', [
    'api', '-H', 'X-GitHub-Api-Version: 2026-03-10',
    `repos/${repo}/actions/jobs/${job.id}/logs`
  ], { capture: false, cwd });
}

export async function monitorRemoteQualityJobs(options) {
  const { cwd, repo, runId, runner } = options;
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const wait = options.wait ?? ((duration) => new Promise((resolve) => setTimeout(resolve, duration)));
  const emittedFailures = new Set();
  while (true) {
    const [runStdout, jobsStdout] = await Promise.all([
      requireSuccess(runner, 'gh', [
        'api', '-H', 'X-GitHub-Api-Version: 2026-03-10',
        `repos/${repo}/actions/runs/${runId}`
      ], { cwd }),
      requireSuccess(runner, 'gh', [
        'api', '-H', 'X-GitHub-Api-Version: 2026-03-10',
        '--paginate', '--slurp', `repos/${repo}/actions/runs/${runId}/jobs?per_page=100`
      ], { cwd })
    ]);
    const run = parseWorkflowRun(runStdout);
    const jobs = parseJobs(jobsStdout);
    for (const job of jobs.filter(isFailedJob)) {
      if (emittedFailures.has(job.id)) continue;
      const log = await emitFailedJobLog(runner, repo, job, cwd);
      if (log.code === 0) emittedFailures.add(job.id);
    }
    if (run.status === 'completed') {
      return { failed: run.conclusion !== 'success', jobs, run };
    }
    await wait(pollIntervalMs);
  }
}

export async function runRemoteQuality(options = {}) {
  const args = parseRemoteQualityArgs(options.args ?? process.argv.slice(2));
  const runner = options.runner ?? runProcess;
  const cwd = options.cwd ?? process.cwd();
  await requireSuccess(runner, 'gh', ['auth', 'status', '--hostname', 'github.com'], { cwd });
  const repoInfo = JSON.parse(await requireSuccess(
    runner, 'gh', ['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef'], { cwd }
  ));
  const branch = await requireSuccess(runner, 'git', ['branch', '--show-current'], { cwd });
  if (repoInfo.defaultBranchRef.name !== 'dev' || branch !== 'dev') {
    throw new Error('Remote Quality is a dev-only orchestrator and requires the local dev branch');
  }
  await requireHostedQualityIdle(runner, repoInfo.nameWithOwner, 'dev', cwd);
  const targetSha = parseRemoteDevSha(await requireSuccess(runner, 'gh', [
    'api', '-H', 'X-GitHub-Api-Version: 2026-03-10',
    `repos/${repoInfo.nameWithOwner}/git/ref/heads/dev`, '--jq', '.object.sha'
  ], { cwd }));

  const payload = JSON.stringify({
    inputs: { scope: args.scope, target_sha: targetSha },
    ref: 'dev'
  });
  const dispatch = JSON.parse(await dispatchWorkflow(runner, [
    'api', '--method', 'POST', '-H', 'X-GitHub-Api-Version: 2026-03-10',
    `repos/${repoInfo.nameWithOwner}/actions/workflows/remote-quality.yml/dispatches`, '--input', '-'
  ], { cwd, input: payload }));
  if (!dispatch.workflow_run_id || !dispatch.html_url) {
    throw new Error('GitHub did not return workflow_run_id and html_url for the dispatch');
  }
  console.log(`[remote-quality] ${args.scope} run: ${dispatch.html_url}`);
  const result = await monitorRemoteQualityJobs({
    cwd,
    repo: repoInfo.nameWithOwner,
    runId: dispatch.workflow_run_id,
    runner,
    wait: options.wait,
    pollIntervalMs: options.pollIntervalMs
  });
  if (result.failed) {
    throw new Error(`Remote ${args.scope} quality failed: ${dispatch.html_url}`);
  }
  console.log(`[remote-quality] ${args.scope} quality passed on dev`);
  return { runId: dispatch.workflow_run_id, scope: args.scope, targetSha, url: dispatch.html_url };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    assertQualityCommandAllowed('runner:remote-quality');
    await runRemoteQuality();
  } catch (error) {
    console.error(`[remote-quality] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
