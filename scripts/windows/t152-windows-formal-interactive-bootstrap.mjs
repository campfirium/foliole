#!/usr/bin/env node
/* global console, process, setTimeout, clearTimeout */

import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const OUTPUT_LIMIT = 1024 * 1024;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function digest(value) { return createHash('sha256').update(value).digest('hex'); }

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, file);
  return value;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function fileFact(file) {
  try { const bytes = fs.readFileSync(file); return { exists: true, sha256: digest(bytes),
    size: bytes.length }; }
  catch (error) { if (error.code === 'ENOENT') return { exists: false, sha256: null, size: null };
    throw error; }
}

const defaultStateOwner = {
  exists: (file) => fs.existsSync(file),
  read: (file) => fs.readFileSync(file),
  write: (file, value) => atomicJson(file, value)
};

function sameValue(left, right) { return canonicalJson(left) === canonicalJson(right); }

function writeBoundReceipt(file, value, stateOwner) {
  stateOwner.write(file, value);
  const raw = stateOwner.read(file);
  const parsed = JSON.parse(raw.toString('utf8'));
  if (!sameValue(parsed, value) || parsed.nonce !== value.nonce) {
    throw new Error('T152 bootstrap receipt verification failed.');
  }
  return { exists: true, sha256: digest(raw), size: raw.length };
}

function assertFreshSelfcheck(state, stateOwner) {
  for (const file of [state.launch, state.result, state.status, state.terminal]) {
    if (stateOwner.exists(file)) throw new Error('T152 bootstrap selfcheck state is not fresh.');
  }
}

export function bootstrapStatePaths(stateRoot) {
  return { config: path.join(stateRoot, 'bootstrap-config.json'),
    launch: path.join(stateRoot, 'bootstrap-launch.json'), request: path.join(stateRoot, 'request.json'),
    result: path.join(stateRoot, 'result.json'), status: path.join(stateRoot, 'status.json'),
    terminal: path.join(stateRoot, 'bootstrap-terminal.json') };
}

export function createBootstrapConfig({ bootstrapPath, identity, mode = 'worker', nodePath, request,
  stateRoot, taskDefinition, timeoutMs = 170_000, workerPath, workingDirectory }) {
  const definitionHash = digest(canonicalJson(taskDefinition));
  return { bootstrapPath, identity, mode, nodePath, nonce: request.nonce,
    requestHash: request.requestHash,
    schemaVersion: 1, stateRoot, taskDefinition, taskDefinitionHash: definitionHash,
    timeoutMs, workerPath, workingDirectory };
}

export function validateBootstrapConfig(config, request, { pathApi = path.win32 } = {}) {
  const paths = ['bootstrapPath', 'nodePath', 'stateRoot', 'workerPath', 'workingDirectory'];
  if (config?.schemaVersion !== 1 || !['worker', 'selfcheck'].includes(config.mode)
      || !paths.every((key) => pathApi.isAbsolute(config[key] ?? ''))
      || !UUID.test(config.nonce ?? '') || config.nonce !== request?.nonce
      || !SHA.test(config.requestHash ?? '') || config.requestHash !== request?.requestHash
      || !Number.isInteger(config.timeoutMs) || config.timeoutMs < 1
      || config.taskDefinitionHash !== digest(canonicalJson(config.taskDefinition))
      || config.taskDefinition?.nodePath !== config.nodePath
      || config.taskDefinition?.stateRoot !== config.stateRoot
      || config.taskDefinition?.bootstrapPath !== config.bootstrapPath) {
    throw new Error('T152 scheduled bootstrap config is invalid.');
  }
  return config;
}

function appendBounded(chunks, chunk, state) {
  const bytes = Buffer.from(chunk);
  if (state.bytes + bytes.length > OUTPUT_LIMIT) throw new Error('bootstrap output limit exceeded');
  chunks.push(bytes); state.bytes += bytes.length;
}

function terminalOutput(chunks) {
  const bytes = Buffer.concat(chunks);
  return { base64: bytes.toString('base64'), bytes: bytes.length, sha256: digest(bytes) };
}

export async function runScheduledWorkerBootstrap(config, request, {
  now = () => Date.now(), spawnChild = spawn, stateOwner = defaultStateOwner,
  timer = setTimeout, cancelTimer = clearTimeout
} = {}) {
  validateBootstrapConfig(config, request);
  const state = bootstrapStatePaths(config.stateRoot);
  if (config.mode === 'selfcheck') assertFreshSelfcheck(state, stateOwner);
  const started = now();
  const launch = { identity: config.identity, mode: config.mode, nonce: config.nonce,
    formalAttempt: request.formalAttempt ?? null, phase: request.phase ?? null,
    productStarted: false, requestHash: config.requestHash, schemaVersion: 1,
    startedAt: new Date(started).toISOString(), taskDefinitionHash: config.taskDefinitionHash };
  const launchFact = writeBoundReceipt(state.launch, launch, stateOwner);
  const launchSha256 = launchFact.sha256;
  if (config.mode === 'selfcheck') {
    const completedAt = new Date(now()).toISOString();
    const completed = { completedAt, exitCode: 0, formalAttempt: null,
      groupAllocated: false, mode: 'selfcheck', nonce: config.nonce, productStarted: false,
      schemaVersion: 2, state: 'completed' };
    const result = writeBoundReceipt(state.result, completed, stateOwner);
    const status = writeBoundReceipt(state.status, completed, stateOwner);
    const terminal = { durationMs: now() - started, endedAt: new Date(now()).toISOString(),
      exitCode: 0, formalAttempt: null, groupAllocated: false, identity: config.identity,
      launchSha256, mode: config.mode, nonce: config.nonce, productStarted: false,
      requestHash: config.requestHash, result, schemaVersion: 1,
      signal: null, spawnError: null, startedAt: launch.startedAt, status,
      stderr: terminalOutput([]), stdout: terminalOutput([]), timedOut: false };
    writeBoundReceipt(state.terminal, terminal, stateOwner); return terminal;
  }
  const stdout = []; const stderr = []; const stdoutState = { bytes: 0 };
  const stderrState = { bytes: 0 }; let child; let timedOut = false;
  const outcome = await new Promise((resolve) => {
    let settled = false; let timeout;
    const finish = (value) => { if (settled) return; settled = true; cancelTimer(timeout); resolve(value); };
    try {
      child = spawnChild(config.nodePath, [config.workerPath, config.stateRoot], {
        cwd: config.workingDirectory, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) { finish({ code: null, error, signal: null }); return; }
    child.stdout?.on('data', (chunk) => { try { appendBounded(stdout, chunk, stdoutState); }
      catch (error) { child.kill(); finish({ code: null, error, signal: null }); } });
    child.stderr?.on('data', (chunk) => { try { appendBounded(stderr, chunk, stderrState); }
      catch (error) { child.kill(); finish({ code: null, error, signal: null }); } });
    child.once('error', (error) => finish({ code: null, error, signal: null }));
    child.once('close', (code, signal) => finish({ code, error: null, signal }));
    timeout = timer(() => { timedOut = true; child.kill(); }, config.timeoutMs);
  });
  const ended = now();
  const terminal = { durationMs: ended - started, endedAt: new Date(ended).toISOString(),
    exitCode: outcome.code, formalAttempt: request.formalAttempt ?? null,
    groupAllocated: request.expectedGroupId !== undefined,
    identity: config.identity, launchSha256, mode: config.mode, nonce: config.nonce,
    productStarted: false, requestHash: config.requestHash, result: fileFact(state.result),
    schemaVersion: 1, signal: outcome.signal, spawnError: outcome.error ? {
      code: outcome.error.code ?? null, message: outcome.error.message,
      name: outcome.error.name } : null, startedAt: launch.startedAt,
    status: fileFact(state.status), stderr: terminalOutput(stderr), stdout: terminalOutput(stdout),
    timedOut };
  atomicJson(state.terminal, terminal); return terminal;
}

export async function waitForScheduledWorker(stateRoot, nonce, {
  intervalMs = 100, resultTimeoutMs = 20 * 60_000, startTimeoutMs = 5_000
} = {}) {
  const state = bootstrapStatePaths(stateRoot); const started = Date.now();
  while (Date.now() - started < resultTimeoutMs) {
    const launch = readJson(state.launch); const terminal = readJson(state.terminal);
    const status = readJson(state.status); const result = readJson(state.result);
    if (launch?.nonce === nonce && terminal?.nonce === nonce) {
      if (terminal.exitCode !== 0 || result?.nonce !== nonce) {
        const error = new Error('T152 scheduled bootstrap failed.');
        error.terminal = terminal; throw error;
      }
    }
    if (launch?.nonce === nonce && result?.nonce === nonce) return result;
    if (launch?.nonce === nonce && status?.nonce === nonce && status.state === 'running') {
      await new Promise((resolve) => setTimeout(resolve, intervalMs)); continue;
    }
    if (Date.now() - started >= startTimeoutMs) throw new Error(
      'T152 scheduled bootstrap did not reach launch, running, or terminal failure.');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('T152 scheduled worker result timed out.');
}

async function main() {
  const stateRoot = process.argv[2];
  if (!path.win32.isAbsolute(stateRoot ?? '')) throw new Error('T152 bootstrap state root is required.');
  const state = bootstrapStatePaths(stateRoot);
  const request = readJson(state.request); const config = readJson(state.config);
  const result = await runScheduledWorkerBootstrap(config, request);
  if (result.exitCode !== 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch((error) => { console.error(`[t152-windows-bootstrap] ${error.message}`);
    process.exitCode = 1; });
}
