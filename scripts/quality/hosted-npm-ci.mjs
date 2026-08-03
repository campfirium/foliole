#!/usr/bin/env node
/* global console, process, setTimeout */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RETRY_DELAY_MS = 5_000;
const ELECTRON_INSTALL_SOURCE = [
  /@electron[\\/]get/iu,
  /node_modules[\\/]electron[\\/](?:install\.js|dist[\\/])/iu,
  /node_modules[\\/]electron[\s\S]{0,300}?\bnode\s+install\.js/iu
];
const TRANSIENT_TRANSFER_FAILURE = [
  /\bfetch failed\b/iu,
  /\b(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|ECONNREFUSED)\b/u,
  /\bUND_ERR_(?:CONNECT_TIMEOUT|HEADERS_TIMEOUT|SOCKET)\b/u,
  /\bsocket hang up\b/iu,
  /\bnetwork timeout\b/iu
];

export function isHostedElectronTransferFailure(output, options = {}) {
  if (!isGithubHosted(options.env ?? process.env)) return false;
  if ((options.args ?? []).includes('--ignore-scripts')) return false;
  return ELECTRON_INSTALL_SOURCE.some((pattern) => pattern.test(output)) &&
    TRANSIENT_TRANSFER_FAILURE.some((pattern) => pattern.test(output));
}

export async function runHostedNpmCi(options = {}) {
  const args = options.args ?? [];
  const env = options.env ?? process.env;
  const runAttempt = options.runAttempt ?? spawnNpmCi;
  const sleep = options.sleep ?? delay;
  const log = options.log ?? console.log;
  const maxAttempts = isGithubHosted(env) && !args.includes('--ignore-scripts') ? 2 : 1;
  let firstFailureClassification = null;
  const attemptResults = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    log(`[hosted-npm-ci] attempt ${attempt}/${maxAttempts} start`);
    const result = await runAttempt({ args, attempt, env, cwd: options.cwd });
    attemptResults.push(result);
    log(`[hosted-npm-ci] attempt ${attempt}/${maxAttempts} end status=${statusLabel(result)}`);
    if (result.status === 0 && !result.signal) {
      return { ...result, attemptResults, attempts: attempt, firstFailureClassification };
    }

    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const retryable = attempt === 1 && !result.signal && Number.isInteger(result.status) &&
      isHostedElectronTransferFailure(output, { args, env });
    if (!retryable) {
      return { ...result, attemptResults, attempts: attempt, firstFailureClassification };
    }
    firstFailureClassification = 'electron-transient-transfer';
    log(`[hosted-npm-ci] retry classification=${firstFailureClassification} backoff_ms=${RETRY_DELAY_MS}`);
    await sleep(RETRY_DELAY_MS);
  }
}

function isGithubHosted(env) {
  return env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'github-hosted';
}

function statusLabel(result) {
  if (result.signal) return `signal:${result.signal}`;
  if (Number.isInteger(result.status)) return String(result.status);
  return 'unknown';
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function npmExecutable() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function spawnNpmCi({ args, cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmExecutable(), ['ci', ...args], {
      cwd: cwd ?? process.cwd(),
      env,
      stdio: ['inherit', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

async function main() {
  const result = await runHostedNpmCi({ args: process.argv.slice(2) });
  if (result.signal) {
    process.kill(process.pid, result.signal);
    return;
  }
  process.exitCode = Number.isInteger(result.status) ? result.status : 1;
}

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryUrl) {
  main().catch((error) => {
    console.error(`[hosted-npm-ci] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
