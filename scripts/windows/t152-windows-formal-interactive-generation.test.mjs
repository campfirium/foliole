// @vitest-environment node
/* global process */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { createT152DesktopDnsSdLibrary } from
  '../desktop/t152-desktop-dnssd-library.mjs';
import { createBootstrapConfig, runScheduledWorkerBootstrap } from
  './t152-windows-formal-interactive-bootstrap.mjs';
import { ADMISSION_ACTION, createFormalInteractiveRequest } from
  './t152-windows-formal-interactive-contract.mjs';
import { transitionCompletedSelfcheck, writeAndPreflightFormalGeneration } from
  './t152-windows-formal-interactive-generation.mjs';

const roots = [];
afterEach(() => { while (roots.length) fs.rmSync(roots.pop(), { force: true, recursive: true }); });
const sha = (value) => createHash('sha256').update(value).digest('hex');

function fixture() {
  const local = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 't152-generation-')));
  roots.push(local);
  const stateRoot = path.join(local, 'state');
  const sourceRoot = path.join(local, 'source'); const evidenceRoot = path.join(local, 'evidence');
  const baseRoot = path.join(local, 'base');
  for (const value of [stateRoot, sourceRoot, evidenceRoot, baseRoot]) {
    fs.mkdirSync(value, { recursive: true });
  }
  const created = createT152DesktopDnsSdLibrary({ baseRoot, evidenceRoot,
    rootId: '11111111-1111-4111-8111-111111111111', sourceRoot });
  const ownerReceipt = JSON.parse(fs.readFileSync(created.receiptPath, 'utf8'));
  return { baseRoot, evidenceRoot, local, ownerReceipt, sourceRoot, stateRoot };
}

function bootstrap(value, nonce, mode = 'selfcheck') {
  const request = { formalAttempt: null, nonce, phase: 'bootstrap-selfcheck',
    requestHash: sha(nonce) };
  const taskDefinition = { bootstrapPath: path.join(value.local, 'bootstrap.mjs'),
    nodePath: process.execPath, stateRoot: value.stateRoot };
  return { config: createBootstrapConfig({ bootstrapPath: taskDefinition.bootstrapPath,
    identity: {}, mode, nodePath: process.execPath, request, stateRoot: value.stateRoot,
    taskDefinition, timeoutMs: 10, workerPath: path.join(value.local, 'worker.mjs'),
    workingDirectory: value.local }), request };
}

function formal(value, nonce) {
  const ownerReceipt = { ...value.ownerReceipt };
  const request = createFormalInteractiveRequest({ action: ADMISSION_ACTION,
    baseRoot: value.baseRoot, capsuleId: '22222222-2222-4222-8222-222222222222',
    capsuleRoot: path.join(value.local, 'capsule'), controllerCommit: 'a'.repeat(40),
    controllerRoot: path.join(value.local, 'controller'), controllerTree: 'b'.repeat(40),
    evidenceRoot: value.evidenceRoot, formalAttempt: { allocated: false, started: false },
    launchEnvHash: sha('launch'), nonce, ownerHash: ownerReceipt.ownerHash, ownerReceipt,
    phase: 'g2-path', protectedRoots: [value.sourceRoot, value.evidenceRoot,
      path.join(value.local, 'controller'), path.join(value.local, 'capsule')],
    rootId: ownerReceipt.rootId, sourceRoot: value.sourceRoot, stateRoot: value.stateRoot });
  const taskDefinition = { bootstrapPath: path.join(value.local, 'bootstrap.mjs'),
    nodePath: process.execPath, stateRoot: value.stateRoot };
  const config = createBootstrapConfig({ bootstrapPath: taskDefinition.bootstrapPath,
    identity: {}, nodePath: process.execPath, request, stateRoot: value.stateRoot,
    taskDefinition, workerPath: path.join(value.local, 'worker.mjs'), workingDirectory: value.local });
  return { config, request };
}

async function completedSelfcheck(value, nonce = '33333333-3333-4333-8333-333333333333') {
  const prior = bootstrap(value, nonce);
  fs.writeFileSync(path.join(value.stateRoot, 'request.json'), JSON.stringify(prior.request));
  fs.writeFileSync(path.join(value.stateRoot, 'bootstrap-config.json'), JSON.stringify(prior.config));
  await runScheduledWorkerBootstrap(prior.config, prior.request);
  return prior;
}

it('validates one completed nonce generation before clearing only its current slot', async () => {
  const value = fixture(); const prior = await completedSelfcheck(value);
  fs.writeFileSync(path.join(value.stateRoot, 'unrelated.json'), '{}');
  const receipt = transitionCompletedSelfcheck(value.stateRoot);
  expect(receipt.nonce).toBe(prior.request.nonce);
  expect(fs.readdirSync(value.stateRoot)).toEqual(['unrelated.json']);
});

it.each(['wrong nonce', 'partial state'])('rejects %s without clearing the slot', async (kind) => {
  const value = fixture(); await completedSelfcheck(value);
  const file = path.join(value.stateRoot, kind === 'wrong nonce' ? 'result.json' : 'status.json');
  if (kind === 'wrong nonce') {
    const result = JSON.parse(fs.readFileSync(file)); result.nonce = '44444444-4444-4444-8444-444444444444';
    fs.writeFileSync(file, JSON.stringify(result));
  } else fs.rmSync(file);
  expect(() => transitionCompletedSelfcheck(value.stateRoot)).toThrow();
  expect(fs.existsSync(path.join(value.stateRoot, 'bootstrap-launch.json'))).toBe(true);
});

it('stops clearing immediately when a slot removal fails', async () => {
  const value = fixture(); await completedSelfcheck(value); let calls = 0;
  expect(() => transitionCompletedSelfcheck(value.stateRoot, { remove(file) {
    calls += 1; if (calls === 2) throw new Error('write protected'); fs.unlinkSync(file);
  } })).toThrow('write protected');
  expect(fs.existsSync(path.join(value.stateRoot, 'bootstrap-launch.json'))).toBe(true);
});

it('writes a fresh generation and passes the production request and owner validators', async () => {
  const value = fixture(); await completedSelfcheck(value); transitionCompletedSelfcheck(value.stateRoot);
  const current = formal(value, '55555555-5555-4555-8555-555555555555');
  const receipt = writeAndPreflightFormalGeneration({ ...current,
    ownerInput: { baseRoot: value.baseRoot, evidenceRoot: value.evidenceRoot,
      rootId: value.ownerReceipt.rootId, sourceRoot: value.sourceRoot }, stateRoot: value.stateRoot,
    writeJsonAtomic(file, data) { fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`); }
  }, { pathApi: path });
  expect(receipt.nonce).toBe(current.request.nonce);
  expect(fs.existsSync(path.join(value.stateRoot, 'bootstrap-launch.json'))).toBe(false);
  expect(fs.existsSync(path.join(value.stateRoot, 'result.json'))).toBe(false);
  expect(fs.existsSync(path.join(value.stateRoot, 'bootstrap-terminal.json'))).toBe(false);
});

it('rejects stale terminal state and wrong request/config nonce before task launch', () => {
  const value = fixture(); const current = formal(value,
    '66666666-6666-4666-8666-666666666666');
  fs.writeFileSync(path.join(value.stateRoot, 'result.json'), '{}');
  expect(() => writeAndPreflightFormalGeneration({ ...current, ownerInput: {},
    stateRoot: value.stateRoot, writeJsonAtomic() {} })).toThrow('terminal state');
  fs.rmSync(path.join(value.stateRoot, 'result.json')); current.config.nonce =
    '77777777-7777-4777-8777-777777777777';
  expect(() => writeAndPreflightFormalGeneration({ ...current,
    ownerInput: { baseRoot: value.baseRoot, evidenceRoot: value.evidenceRoot,
      rootId: value.ownerReceipt.rootId, sourceRoot: value.sourceRoot }, stateRoot: value.stateRoot,
    writeJsonAtomic(file, data) { fs.writeFileSync(file, JSON.stringify(data)); }
  }, { pathApi: path })).toThrow();
});
