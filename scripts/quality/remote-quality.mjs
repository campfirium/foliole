/* global console, process */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { assertQualityCommandAllowed } from './quality-command-contracts.mjs';
import {
  assertRemoteQualityRepositoryContext,
  assertRemoteQualitySourceContext,
  parseRemoteBranchSha
} from './remote-quality-target.mjs';

import { parseRemoteQualityArgs } from './remote-quality-args.mjs';
import { runRemoteQualityPreflight } from './remote-quality-preflight.mjs';
import { runWindowsRemoteQualityPreflight } from './remote-quality-preflight-windows.mjs';
import { monitorRemoteQualityJobs, requireSuccess } from './remote-quality-monitor.mjs';
import { resolveReplayStages } from './remote-quality-replay.mjs';
import { awaitCoveringFullRun, findActiveHostedQualityRuns } from './remote-quality-active.mjs';
export { parseRemoteQualityArgs } from './remote-quality-args.mjs';
export { findActiveHostedQualityRuns } from './remote-quality-active.mjs';
export { monitorRemoteQualityJobs } from './remote-quality-monitor.mjs';

const QUALITY_WORKFLOWS = ['remote-quality.yml', 't7-hosted-quality.yml'];

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

async function dispatchWorkflow(runner, args, options) {
  const result = await runner('gh', args, options);
  if (result.code === 0) return result.stdout.trim();
  const details = (result.stderr || result.stdout).trim();
  if (/\b403\b|forbidden|resource not accessible/iu.test(details)) {
    throw new Error(`GitHub Actions write permission is required to dispatch Remote Quality: ${details}`);
  }
  throw new Error(`gh ${args.join(' ')} failed: ${details}`.trim());
}

function parseWorkflowRuns(value) {
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed.workflow_runs)) {
    throw new Error('GitHub workflow runs response did not contain a workflow_runs array');
  }
  return parsed.workflow_runs;
}

async function listActiveHostedQualityRuns(runner, repo, branch, cwd) {
  const responses = await Promise.all(QUALITY_WORKFLOWS.map((workflow) => requireSuccess(
    runner,
    'gh',
    ['api', '-H', 'X-GitHub-Api-Version: 2026-03-10',
      `repos/${repo}/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(branch)}&per_page=30`],
    { cwd }
  )));
  return findActiveHostedQualityRuns(responses.map(parseWorkflowRuns), branch);
}

async function resolveTree(runner, cwd, sha) {
  const result = await runner('git', ['rev-parse', '--verify', '--quiet', `${sha}^{tree}`], { cwd });
  return result.code === 0 ? result.stdout.trim() || null : null;
}

// A full or replay request waits on an active complete chain of the same tree
// rather than dispatching a duplicate that the server group would cancel.
function awaitActiveFullChain({ args, cwd, options, repo, runner, targetSha }) {
  if (args.scope !== 'full' && args.scope !== 'replay') return null;
  return awaitCoveringFullRun({
    listRuns: () => listActiveHostedQualityRuns(runner, repo, 'dev', cwd),
    log: console.log,
    monitor: (runId) => monitorRemoteQualityJobs({ cwd, pollIntervalMs: options.pollIntervalMs,
      repo, runId, runner, wait: options.wait }),
    targetSha,
    treeOf: (sha) => resolveTree(runner, cwd, sha)
  });
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
  const sourceBranch = assertRemoteQualityRepositoryContext({
    defaultBranch: repoInfo.defaultBranchRef.name, localBranch: branch, sourceRef: args.sourceRef
  });
  const targetSha = parseRemoteBranchSha(await requireSuccess(runner, 'gh', [
    'api', '-H', 'X-GitHub-Api-Version: 2026-03-10',
    `repos/${repoInfo.nameWithOwner}/git/ref/heads/${sourceBranch}`, '--jq', '.object.sha'
  ], { cwd }), sourceBranch);
  assertRemoteQualitySourceContext({ defaultBranch: repoInfo.defaultBranchRef.name,
    localBranch: branch, sourceRef: args.sourceRef });
  const active = await awaitActiveFullChain({ args, cwd, options, repo: repoInfo.nameWithOwner,
    runner, targetSha });
  if (active) {
    if (active.failed) throw new Error(`Remote full quality failed: ${active.url}`);
    return { jobs: active.jobs, reused: true, runId: active.runId, scope: args.scope,
      sourceRef: args.sourceRef, targetSha, url: active.url };
  }
  // The chosen preflight host is explicit; a Windows failure never falls back to the Mac.
  const preflight = args.preflightHost === 'windows' ? options.windowsPreflight : options.preflight;
  if (args.preflightHost === 'windows' && !preflight) throw new Error('Windows preflight is not available');
  if (preflight && !args.replay && !args.skipPreflight) {
    await preflight({ cwd, head: targetSha, repo: repoInfo.nameWithOwner, runner, scope: args.scope });
  }

  const stages = args.replay ? await resolveReplayStages({
    repository: repoInfo.nameWithOwner, runId: args.replay, read: options.readChainVerdict,
    readRun: async runId => JSON.parse(await requireSuccess(runner, 'gh', [
      'api', `repos/${repoInfo.nameWithOwner}/actions/runs/${runId}`
    ], { cwd }))
  }) : undefined;
  const payload = JSON.stringify({
    inputs: { scope: args.scope, target_sha: targetSha, ...(stages ? { stages } : {}) },
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
  return { jobs: result.jobs, runId: dispatch.workflow_run_id, scope: args.scope,
    sourceRef: args.sourceRef, targetSha, url: dispatch.html_url };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    assertQualityCommandAllowed('runner:remote-quality');
    const result = await runRemoteQuality({ preflight: runRemoteQualityPreflight,
      windowsPreflight: runWindowsRemoteQualityPreflight });
    console.log(`[remote-quality] ${result.scope} quality passed for ${result.sourceRef} `
      + `at ${result.targetSha}`);
  } catch (error) {
    console.error(`[remote-quality] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
