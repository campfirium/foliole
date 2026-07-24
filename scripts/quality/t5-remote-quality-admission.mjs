#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const COMPLETE_CONCLUSIONS = new Set(['failure', 'success']);

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
    COMPLETE_CONCLUSIONS.has(run.conclusion) &&
    run.display_title === expectedTitle
  ));
}

export function shouldRunT5({ eventName, runs, targetSha }) {
  return eventName !== 'schedule' || !hasCompletedFullRemoteValidation(runs, targetSha);
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

export async function resolveT5Admission(options = {}) {
  const env = options.env ?? process.env;
  const eventName = env.FOLIOLE_QUALITY_EVENT ?? '';
  const targetSha = env.FOLIOLE_QUALITY_TARGET_SHA ?? '';
  const repository = env.FOLIOLE_QUALITY_REPOSITORY ?? '';
  if (!targetSha || !repository) throw new Error('T5 admission requires repository and target SHA');
  const runs = eventName === 'schedule'
    ? await readRemoteQualityRuns(options.runner ?? runProcess, repository)
    : [];
  return shouldRunT5({ eventName, runs, targetSha });
}

async function main() {
  const shouldRun = await resolveT5Admission();
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) throw new Error('GITHUB_OUTPUT is required');
  appendFileSync(outputPath, `should_run=${shouldRun}\n`, 'utf8');
  console.log(shouldRun ? '[t5-admission] running hosted quality' : '[t5-admission] duplicate full SHA already completed; skipping');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`[t5-admission] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
