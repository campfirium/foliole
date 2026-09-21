#!/usr/bin/env node
/* global console, process, setTimeout */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RETRY_DELAY_MS = 5_000;
const ELECTRON_DOWNLOAD_SOURCE = [
  /@electron[\\/]get/iu,
  /electron[\\/]releases[\\/]download/iu,
  /node_modules[\\/]electron[\\/]/iu
];
const TRANSIENT_DOWNLOAD_FAILURE = [
  /HTTPError:\s*Response code (?:408|429|5\d\d)\b/iu,
  /\b(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|ECONNREFUSED)\b/u,
  /\bUND_ERR_(?:CONNECT_TIMEOUT|HEADERS_TIMEOUT|SOCKET)\b/u,
  /\b(?:fetch failed|socket hang up|network timeout)\b/iu
];

function isGithubHosted(env) {
  return env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'github-hosted';
}

export function isHostedElectronRuntimeTransferFailure(output, options = {}) {
  if (!isGithubHosted(options.env ?? process.env)) return false;
  return ELECTRON_DOWNLOAD_SOURCE.some((pattern) => pattern.test(output)) &&
    TRANSIENT_DOWNLOAD_FAILURE.some((pattern) => pattern.test(output));
}

export async function runHostedElectronSqlitePreflight(options = {}) {
  const env = options.env ?? process.env;
  const runAttempt = options.runAttempt ?? spawnPreflight;
  const sleep = options.sleep ?? delay;
  const log = options.log ?? console.log;
  const maxAttempts = isGithubHosted(env) ? 2 : 1;
  const attemptResults = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    log(`[hosted-electron-preflight] attempt ${attempt}/${maxAttempts} start`);
    const result = await runAttempt({ attempt, cwd: options.cwd, env });
    attemptResults.push(result);
    log(`[hosted-electron-preflight] attempt ${attempt}/${maxAttempts} end status=${statusLabel(result)}`);
    if (result.status === 0 && !result.signal) return { ...result, attemptResults, attempts: attempt };
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const retryable = attempt === 1 && !result.signal && Number.isInteger(result.status) &&
      isHostedElectronRuntimeTransferFailure(output, { env });
    if (!retryable) return { ...result, attemptResults, attempts: attempt };
    log(`[hosted-electron-preflight] retry classification=electron-runtime-transfer backoff_ms=${RETRY_DELAY_MS}`);
    await sleep(RETRY_DELAY_MS);
  }
}

function statusLabel(result) {
  if (result.signal) return `signal:${result.signal}`;
  return Number.isInteger(result.status) ? String(result.status) : 'unknown';
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function spawnPreflight({ cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/electron-sqlite-runner.mjs', '--preflight'], {
      cwd: cwd ?? process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { stderr += chunk; process.stderr.write(chunk); });
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

async function main() {
  const result = await runHostedElectronSqlitePreflight();
  if (result.signal) {
    process.kill(process.pid, result.signal);
    return;
  }
  process.exitCode = Number.isInteger(result.status) ? result.status : 1;
}

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryUrl) {
  main().catch((error) => {
    console.error(`[hosted-electron-preflight] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
