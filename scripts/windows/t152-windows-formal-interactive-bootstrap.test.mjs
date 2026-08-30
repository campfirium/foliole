// @vitest-environment node
/* global queueMicrotask */

import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it } from 'vitest';

import { bootstrapStatePaths, createBootstrapConfig, runScheduledWorkerBootstrap } from
  './t152-windows-formal-interactive-bootstrap.mjs';

const roots = [];
const NONCE = '11111111-1111-4111-8111-111111111111';
const HASH = createHash('sha256').update('request').digest('hex');

afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true }); });

function fixture() {
  const local = fs.mkdtempSync(path.join(os.tmpdir(), 't152-bootstrap-')); roots.push(local);
  const stateRoot = 'X:\\task\\state';
  const request = { nonce: NONCE, requestHash: HASH };
  const taskDefinition = { bootstrapPath: 'Y:\\controller\\bootstrap.mjs',
    nodePath: 'Z:\\node.exe', principal: { logonType: 'Interactive', runLevel: 'Limited' },
    settings: { executionTimeLimit: 'PT3M', multipleInstances: 'IgnoreNew' }, stateRoot,
    taskName: 'FolioleNativeClient', workingDirectory: 'Y:\\source' };
  const config = createBootstrapConfig({ bootstrapPath: taskDefinition.bootstrapPath,
    identity: { capsuleId: 'capsule', rootId: 'root' }, nodePath: taskDefinition.nodePath,
    request, stateRoot, taskDefinition, timeoutMs: 10, workerPath: 'Y:\\controller\\worker.mjs',
    workingDirectory: taskDefinition.workingDirectory });
  const paths = bootstrapStatePaths(local);
  config.stateRoot = local; config.taskDefinition.stateRoot = local;
  config.taskDefinitionHash = createHash('sha256').update(JSON.stringify({})).digest('hex');
  return { config, local, paths, request, taskDefinition };
}

function sign(config) {
  return createBootstrapConfig({ bootstrapPath: config.bootstrapPath, identity: config.identity,
    mode: config.mode, nodePath: config.nodePath, request: { nonce: config.nonce,
      requestHash: config.requestHash }, stateRoot: config.stateRoot,
    taskDefinition: { ...config.taskDefinition, stateRoot: config.stateRoot },
    timeoutMs: config.timeoutMs, workerPath: config.workerPath,
    workingDirectory: config.workingDirectory });
}

function child(outcome) {
  const value = new EventEmitter(); value.stdout = new PassThrough();
  value.stderr = new PassThrough(); value.kill = () => queueMicrotask(() => value.emit('close', null, 'SIGTERM'));
  queueMicrotask(() => {
    if (outcome.error) value.emit('error', outcome.error);
    else { value.stdout.end(outcome.stdout ?? ''); value.stderr.end(outcome.stderr ?? '');
      value.emit('close', outcome.code, outcome.signal ?? null); }
  });
  return value;
}

it.each([
  ['success', { code: 0, stdout: 'ok' }, 0, null],
  ['failure', { code: 7, stderr: 'bad' }, 7, null],
  ['spawn error', { error: Object.assign(new Error('spawn failed'), { code: 'ENOENT' }) },
    null, 'ENOENT']
])('persists a bound %s terminal', async (_label, outcome, exitCode, errorCode) => {
  const value = fixture(); const config = sign(value.config);
  const terminal = await runScheduledWorkerBootstrap(config, value.request,
    { spawnChild: () => child(outcome) });
  expect(terminal.exitCode).toBe(exitCode);
  expect(terminal.spawnError?.code ?? null).toBe(errorCode);
  expect(terminal.nonce).toBe(NONCE);
  expect(JSON.parse(fs.readFileSync(value.paths.launch, 'utf8')).nonce).toBe(NONCE);
  expect(JSON.parse(fs.readFileSync(value.paths.terminal, 'utf8')).exitCode).toBe(exitCode);
});

it('kills once and records a bounded timeout terminal', async () => {
  const value = fixture(); const config = sign(value.config); let killed = 0;
  const process = new EventEmitter();
  process.stdout = new PassThrough(); process.stderr = new PassThrough();
  process.kill = () => { killed += 1; queueMicrotask(() => process.emit('close', null, 'SIGTERM')); };
  const terminal = await runScheduledWorkerBootstrap(config, value.request, {
    spawnChild: () => process, timer: (callback) => { queueMicrotask(callback); return 1; },
    cancelTimer: () => {} });
  expect(killed).toBe(1); expect(terminal.timedOut).toBe(true);
  expect(terminal.signal).toBe('SIGTERM');
});

it('selfcheck writes launch then terminal without spawning a worker', async () => {
  const value = fixture(); const config = sign({ ...value.config, mode: 'selfcheck' });
  let spawned = false;
  const terminal = await runScheduledWorkerBootstrap(config, value.request,
    { spawnChild: () => { spawned = true; return child({ code: 0 }); } });
  expect(spawned).toBe(false); expect(terminal.exitCode).toBe(0);
  expect(terminal.productStarted).toBe(false); expect(terminal.groupAllocated).toBe(false);
});
