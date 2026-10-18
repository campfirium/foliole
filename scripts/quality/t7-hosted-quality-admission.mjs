#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { readChainVerdict } from './chain-verdict-read.mjs';

const ACTIVE_RUN_STATUSES = new Set(['in_progress', 'pending', 'queued', 'requested', 'waiting']);
const DEV_QUALITY_WORKFLOWS = ['remote-quality.yml', 't7-hosted-quality.yml'];
const DECISIVE_VERDICTS = new Set(['passed', 'failed']);
// Only the newest finished runs of the target SHA can hold its latest verdict.
const MAX_VERDICT_READS = 10;

function runProcess(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ code: 1, stderr: error.message, stdout }));
    child.on('exit', (code) => resolve({ code: code ?? 1, stderr, stdout }));
  });
}

/** Decides whether the dev T7 entry should run for the current dev tip. */
export function decideT7Admission({ releaseActive, runs, currentRunId, verdicts }) {
  if (releaseActive) return 'release-active';
  const others = runs.filter((run) => String(run.id) !== String(currentRunId));
  if (others.some((run) => ACTIVE_RUN_STATUSES.has(run.status))) return 'active-run';
  const decisive = verdicts.some((verdict) => verdict.kind === 'full' && DECISIVE_VERDICTS.has(verdict.verdict));
  return decisive ? 'decisive-full-verdict' : 'admitted';
}

/** Finished runs of the target SHA whose chain verdict may decide it. */
export function selectVerdictCandidates(runs, targetSha, currentRunId) {
  return runs
    .filter((run) => run.status === 'completed' && run.head_sha === targetSha
      && String(run.id) !== String(currentRunId) && ['success', 'failure'].includes(run.conclusion))
    .sort((left, right) => String(right.created_at ?? '').localeCompare(String(left.created_at ?? '')))
    .slice(0, MAX_VERDICT_READS);
}

function ghApi(runner, endpoint) {
  return runner('gh', ['api', '-H', 'X-GitHub-Api-Version: 2026-03-10', endpoint]);
}

async function readReleaseActive(runner, repository) {
  const result = await ghApi(runner, `repos/${repository}/git/ref/heads/release`);
  if (result.code === 0) return true;
  if (/\b404\b|not found/iu.test(result.stderr || result.stdout)) return false;
  throw new Error(`failed to read release ref: ${result.stderr || result.stdout}`.trim());
}

async function readDevQualityRuns(runner, repository) {
  const pages = await Promise.all(DEV_QUALITY_WORKFLOWS.map(async (workflow) => {
    const result = await ghApi(runner, `repos/${repository}/actions/workflows/${workflow}/runs?branch=dev&per_page=100`);
    if (result.code !== 0) {
      throw new Error(`failed to read ${workflow} runs: ${result.stderr || result.stdout}`.trim());
    }
    const payload = JSON.parse(result.stdout);
    if (!Array.isArray(payload.workflow_runs)) throw new Error(`${workflow} runs response did not contain workflow_runs`);
    return payload.workflow_runs;
  }));
  return pages.flat();
}

export async function resolveT7Admission(options = {}) {
  const env = options.env ?? process.env;
  const targetSha = env.FOLIOLE_QUALITY_TARGET_SHA ?? '';
  const repository = env.FOLIOLE_QUALITY_REPOSITORY ?? '';
  const currentRunId = env.FOLIOLE_QUALITY_RUN_ID ?? '';
  if (!targetSha || !repository || !currentRunId) {
    throw new Error('T7 admission requires repository, target SHA and current run ID');
  }
  const runner = options.runner ?? runProcess;
  const readVerdict = options.readVerdict ?? readChainVerdict;
  if (await readReleaseActive(runner, repository)) return { reason: 'release-active', shouldRun: false };
  const runs = await readDevQualityRuns(runner, repository);
  if (decideT7Admission({ releaseActive: false, runs, currentRunId, verdicts: [] }) === 'active-run') {
    return { reason: 'active-run', shouldRun: false };
  }
  const verdicts = selectVerdictCandidates(runs, targetSha, currentRunId)
    .map((run) => readVerdict({ repository, runId: run.id, targetSha }));
  const reason = decideT7Admission({ releaseActive: false, runs, currentRunId, verdicts });
  return { reason, shouldRun: reason === 'admitted' };
}

async function main() {
  const admission = await resolveT7Admission();
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) throw new Error('GITHUB_OUTPUT is required');
  appendFileSync(outputPath, `should_run=${admission.shouldRun}\n`, 'utf8');
  appendFileSync(outputPath, `reason=${admission.reason}\n`, 'utf8');
  console.log(`[t7-admission] ${admission.reason}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`[t7-admission] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
