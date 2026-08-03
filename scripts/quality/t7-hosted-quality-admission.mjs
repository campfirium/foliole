#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

export function hasCompletedFullRemoteValidation(runs, targetSha) {
  const expectedTitle = `Remote Quality (full) @ ${targetSha}`;
  return runs.some((run) => (
    run.status === 'completed' &&
    run.conclusion === 'success' &&
    run.display_title === expectedTitle
  ));
}

export function shouldRunT7({ eventName, releaseActive, runs, targetSha }) {
  if (releaseActive) return false;
  return eventName !== 'schedule' || !hasCompletedFullRemoteValidation(runs, targetSha);
}

async function readReleaseActive(runner, repository) {
  const result = await runner('gh', [
    'api', '-H', 'X-GitHub-Api-Version: 2026-03-10',
    `repos/${repository}/git/ref/heads/release`
  ]);
  if (result.code === 0) return true;
  if (/\b404\b|not found/iu.test(result.stderr || result.stdout)) return false;
  throw new Error(`failed to read release ref: ${result.stderr || result.stdout}`.trim());
}

async function readRemoteQualityRuns(runner, repository) {
  const result = await runner('gh', [
    'api', '-H', 'X-GitHub-Api-Version: 2026-03-10',
    `repos/${repository}/actions/workflows/remote-quality.yml/runs?per_page=100`
  ]);
  if (result.code !== 0) {
    throw new Error(`failed to read Remote Quality runs: ${result.stderr || result.stdout}`.trim());
  }
  const payload = JSON.parse(result.stdout);
  if (!Array.isArray(payload.workflow_runs)) {
    throw new Error('Remote Quality runs response did not contain workflow_runs');
  }
  return payload.workflow_runs;
}

export async function resolveT7Admission(options = {}) {
  const env = options.env ?? process.env;
  const eventName = env.FOLIOLE_QUALITY_EVENT ?? '';
  const targetSha = env.FOLIOLE_QUALITY_TARGET_SHA ?? '';
  const repository = env.FOLIOLE_QUALITY_REPOSITORY ?? '';
  if (!targetSha || !repository) throw new Error('T7 admission requires repository and target SHA');
  const runner = options.runner ?? runProcess;
  const releaseActive = await readReleaseActive(runner, repository);
  const runs = eventName === 'schedule'
    && !releaseActive
    ? await readRemoteQualityRuns(runner, repository)
    : [];
  return {
    reason: releaseActive
      ? 'release-active'
      : shouldRunT7({ eventName, releaseActive, runs, targetSha })
        ? 'admitted'
        : 'duplicate-full-validation',
    shouldRun: shouldRunT7({ eventName, releaseActive, runs, targetSha })
  };
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
