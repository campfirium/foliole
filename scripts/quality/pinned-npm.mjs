#!/usr/bin/env node
/* global console */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const PIN_PATTERN = /^npm@(\d+\.\d+\.\d+)(?:\+[A-Za-z0-9.-]+)?$/u;
const RETRY_DELAY_MS = 5_000;
const TRANSIENT_REGISTRY_FAILURE = [
  /\bfetch failed\b/iu,
  /\b(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|ECONNREFUSED|ENOTFOUND)\b/u,
  /\bUND_ERR_(?:CONNECT_TIMEOUT|HEADERS_TIMEOUT|SOCKET)\b/u,
  /\bsocket hang up\b/iu,
  /\bnetwork timeout\b/iu,
  /\bHTTP(?: response| status(?: code)?)?\s*:?\s*(?:408|429|5\d\d)\b/iu,
  /\bError when performing the request to https:\/\/registry\.npmjs\.org\//iu
];
const DETERMINISTIC_REGISTRY_FAILURE = [
  /\bHTTP(?: response| status(?: code)?)?\s*:?\s*(?:400|401|403|404|405|409|410|422)\b/iu,
  /\b(?:integrity|signature|keyid|checksum)\b/iu,
  /\b(?:invalid|unsupported) (?:version|descriptor|configuration)\b/iu,
  /\b(?:authentication|authorization|certificate|proxy configuration)\b/iu,
  /\b(?:CERT_HAS_EXPIRED|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE)\b/u
];

export function readPinnedNpm(repoRoot = REPO_ROOT) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const descriptor = packageJson.packageManager;
  const match = typeof descriptor === 'string' ? PIN_PATTERN.exec(descriptor) : null;
  if (!match) throw new Error('package.json must pin packageManager as npm@<exact-version>');
  return { descriptor, version: match[1] };
}

function runChecked(runner, command, args, options, platform, windowsShell) {
  const result = runExecutable(runner, command, args, options, platform, windowsShell);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
  return result;
}

function runExecutable(runner, name, args, options, platform, windowsShell) {
  if (platform !== 'win32') return runner(name, args, options);
  const commandLine = [`${name}.cmd`, ...args].join(' ');
  return runner(windowsShell, ['/d', '/s', '/c', commandLine], options);
}

function isGithubHosted(env) {
  return env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'github-hosted';
}

export function isHostedPinnedNpmRegistryFailure(output, options = {}) {
  if (!isGithubHosted(options.env ?? process.env)) return false;
  const tarballUrl = `https://registry.npmjs.org/npm/-/npm-${options.version}.tgz`;
  const installMarker = `Installing npm@${options.version}`;
  return (output.includes(tarballUrl) || output.includes(installMarker)) &&
    !DETERMINISTIC_REGISTRY_FAILURE.some((pattern) => pattern.test(output)) &&
    TRANSIENT_REGISTRY_FAILURE.some((pattern) => pattern.test(output));
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function replayOutput(result, stdout, stderr) {
  if (result.stdout) stdout.write(result.stdout);
  if (result.stderr) stderr.write(result.stderr);
}

function installPinnedNpm(pinned, options) {
  const maxAttempts = isGithubHosted(options.env) ? 2 : 1;
  const args = ['install', '--global', pinned.descriptor];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    options.log(`[pinned-npm] install attempt ${attempt}/${maxAttempts} start`);
    const result = runExecutable(options.runner, 'corepack', args, {
      cwd: options.repoRoot,
      encoding: 'utf8'
    }, options.platform, options.windowsShell);
    replayOutput(result, options.stdout, options.stderr);
    options.log(`[pinned-npm] install attempt ${attempt}/${maxAttempts} end status=${result.status}`);
    if (result.error) throw result.error;
    if (result.status === 0) return;
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const retryable = attempt === 1 && Number.isInteger(result.status) &&
      isHostedPinnedNpmRegistryFailure(output, { env: options.env, version: pinned.version });
    if (!retryable) throw new Error(`corepack ${args.join(' ')} exited ${result.status}`);
    options.log(`[pinned-npm] retry classification=npm-registry-transient backoff_ms=${RETRY_DELAY_MS}`);
    options.sleep(RETRY_DELAY_MS);
  }
}

export function verifyPinnedNpm(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const runner = options.runner ?? spawnSync;
  const platform = options.platform ?? process.platform;
  const windowsShell = options.windowsShell ?? process.env.ComSpec ?? 'cmd.exe';
  const log = options.log ?? console.log;
  const pinned = readPinnedNpm(repoRoot);
  const result = runChecked(runner, 'npm', ['--version'], {
    cwd: repoRoot,
    encoding: 'utf8'
  }, platform, windowsShell);
  const actualVersion = result.stdout.trim();
  if (actualVersion !== pinned.version) {
    throw new Error(`expected ${pinned.descriptor}, received npm@${actualVersion}`);
  }
  log(`[pinned-npm] ok: ${pinned.descriptor}`);
  return pinned;
}

export function activatePinnedNpm(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const runner = options.runner ?? spawnSync;
  const platform = options.platform ?? process.platform;
  const windowsShell = options.windowsShell ?? process.env.ComSpec ?? 'cmd.exe';
  const env = options.env ?? process.env;
  const log = options.log ?? console.log;
  const pinned = readPinnedNpm(repoRoot);
  const runOptions = { cwd: repoRoot, stdio: 'inherit' };
  runChecked(runner, 'corepack', ['enable', 'npm'], runOptions, platform, windowsShell);
  installPinnedNpm(pinned, {
    env,
    log,
    platform,
    repoRoot,
    runner,
    sleep: options.sleep ?? sleep,
    stderr: options.stderr ?? process.stderr,
    stdout: options.stdout ?? process.stdout,
    windowsShell
  });
  return verifyPinnedNpm({ ...options, repoRoot, runner, platform });
}

function main() {
  const command = process.argv[2];
  if (command === 'activate') return activatePinnedNpm();
  if (command === 'verify') return verifyPinnedNpm();
  throw new Error('usage: node scripts/quality/pinned-npm.mjs <activate|verify>');
}

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryUrl) {
  try {
    main();
  } catch (error) {
    console.error(`[pinned-npm] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
