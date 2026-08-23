// @vitest-environment node
/* global process */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { createMacosA5ExecutionContext } from './macos-a5-execution-context.mjs';
import { assertRegisteredMacosA5Action } from './macos-a5-action-registry.mjs';
import {
  assertAcceptedSourceIdentity, captureFormalA5Toolchain, completeFormalA5Receipt,
  failFormalA5Receipt, formalA5AcceptedTipLine, formalA5FailureStage,
  markFormalA5ActionRunning,
  markFormalA5MutationBoundary, markFormalA5Stage,
  openFormalA5Receipt, prepareFormalA5ReceiptCompletion, recordFormalA5Cleanup,
  recordFormalA5DataProtection, recordFormalA5Lease, recordFormalA5LeaseReleased
} from './macos-a5-formal-receipt.mjs';

const roots = [];

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function fixture(action = 'build', runId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') {
  const parent = path.join(process.cwd(), '.tmp/artifacts');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'macos-a5-receipt-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  git(root, ['init', '-b', 'dev']);
  git(root, ['config', 'user.email', 'receipt@example.invalid']);
  git(root, ['config', 'user.name', 'Receipt Test']);
  git(root, ['add', '.']); git(root, ['commit', '-m', 'fixture']);
  const acceptedRevision = git(root, ['rev-parse', 'HEAD']);
  const acceptedTree = git(root, ['rev-parse', 'HEAD^{tree}']);
  const base = createMacosA5ExecutionContext({ acceptedRevision, acceptedTree, action,
    formalSourceClass: 'frozen-build', repoRoot: root, runId });
  const context = Object.freeze({ ...base, sourceArchiveDigest: 'f'.repeat(64) });
  return { context, root };
}

function contract(action) {
  return assertRegisteredMacosA5Action(action);
}

function toolResult() {
  return { status: 0, stderr: '', stdout: 'tool 1.0\n' };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

it('atomically completes a same-run provenance receipt before projecting accepted tip', () => {
  const { context, root } = fixture();
  const manager = openFormalA5Receipt(context, contract('build'));
  const buildRoot = path.join(root, 'capsule');
  const paths = { adb: '/adb', apk: path.join(buildRoot, 'android/app-debug.apk'),
    buildRoot, cap: '/cap', gradle: '/gradle', java: '/java' };
  fs.mkdirSync(path.dirname(paths.apk), { recursive: true });
  fs.writeFileSync(paths.apk, 'apk bytes');
  captureFormalA5Toolchain(manager, paths, toolResult);
  markFormalA5ActionRunning(manager);
  prepareFormalA5ReceiptCompletion(manager, context, paths);
  expect(() => completeFormalA5Receipt(manager)).toThrow('before controller cleanup');
  recordFormalA5Cleanup(manager, 'complete');
  const completed = completeFormalA5Receipt(manager);
  expect(formalA5AcceptedTipLine(completed))
    .toBe(`[macos-a5-dev] accepted-tip=${context.acceptedRevision}\n`);

  const receipt = JSON.parse(fs.readFileSync(manager.path, 'utf8'));
  expect(receipt).toMatchObject({ action: 'build', resultStatus: 'complete', schemaVersion: 2,
    runId: context.runId, stage: 'complete', source: {
      acceptedRevision: context.acceptedRevision, acceptedTree: context.acceptedTree
    }, target: { identity: 'accepted-source-archive', kind: 'build-capsule' } });
  expect(receipt.lockfileDigest).toMatch(/^[0-9a-f]{64}$/u);
  expect(receipt.apk.digest).toMatch(/^[0-9a-f]{64}$/u);
  expect(receipt.evidence.runId).toBe(context.runId);
  expect(receipt.source.archiveDigest).toBe('f'.repeat(64));
  expect(receipt.diagnostics).not.toHaveProperty('controllerDigests');
  expect(receipt).not.toHaveProperty('syncSuccess');
  expect(fs.readdirSync(path.dirname(manager.path)).some((name) => name.includes('.tmp-')))
    .toBe(false);
  expect(() => failFormalA5Receipt(manager, new Error('late secret'))).toThrow('finalized');
});

it('records the capsule Electron identity for hidden desktop actions', () => {
  const { context, root } = fixture('sync-existing',
    'abababab-abab-abab-abab-abababababab');
  const hiddenContext = Object.freeze({ ...context, requiresHiddenDesktopRuntime: true });
  const manager = openFormalA5Receipt(hiddenContext, contract('sync-existing'));
  const buildRoot = path.join(root, 'capsule');
  const paths = { ...hiddenContext, adb: '/adb', buildRoot, cap: '/cap', gradle: '/gradle',
    java: '/java', electron: path.join(buildRoot, 'Electron'),
    electronPackage: path.join(buildRoot, 'package.json') };
  fs.mkdirSync(buildRoot); fs.writeFileSync(paths.electron, 'electron binary');
  fs.writeFileSync(paths.electronPackage, '{"version":"43.4.0"}\n');
  captureFormalA5Toolchain(manager, paths, toolResult);
  expect(manager.receipt.diagnostics.toolchain.electron).toEqual({
    executableDigest: '4f57ce53f599ead3c3eca2d5154ac1429178f463b41ce351507f09a389e1f2d9',
    version: '43.4.0'
  });
});

it('records redacted failure stages on both sides of the mutation boundary', () => {
  const first = fixture('deploy', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb').context;
  const before = openFormalA5Receipt(first, contract('deploy'));
  failFormalA5Receipt(before, new Error('credential=do-not-store'));
  const beforeText = fs.readFileSync(before.path, 'utf8');
  expect(JSON.parse(beforeText)).toMatchObject({ failedStage: 'pending', resultStatus: 'failed',
    mutationBoundary: { crossed: false } });
  expect(beforeText).not.toContain('credential=do-not-store');
  expect(() => formalA5AcceptedTipLine(before.receipt)).toThrow('complete formal receipt');

  const second = fixture('deploy', 'cccccccc-cccc-cccc-cccc-cccccccccccc').context;
  const after = openFormalA5Receipt(second, contract('deploy'));
  markFormalA5MutationBoundary(after);
  failFormalA5Receipt(after, Object.assign(new Error('private library path'), { code: 'device' }));
  expect(JSON.parse(fs.readFileSync(after.path, 'utf8'))).toMatchObject({
    failedStage: 'action-running', failure: { code: 'device' },
    mutationBoundary: { crossed: true }, resultStatus: 'failed'
  });
  expect(() => completeFormalA5Receipt(after)).toThrow('finalized');
});

it('preserves the injected build stage in a failure receipt', () => {
  const context = fixture('build', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee').context;
  const manager = openFormalA5Receipt(context, contract('build'));
  markFormalA5Stage(manager, 'capsule-dependencies');
  recordFormalA5Cleanup(manager, 'complete');
  failFormalA5Receipt(manager, new Error('npm ci failed'), 'capsule-dependencies');
  expect(JSON.parse(fs.readFileSync(manager.path, 'utf8'))).toMatchObject({
    failedStage: 'capsule-dependencies', resultStatus: 'failed'
  });
});

it('keeps an action failure stage after successful cleanup', () => {
  const context = fixture('deploy', 'ffffffff-ffff-ffff-ffff-ffffffffffff').context;
  const manager = openFormalA5Receipt(context, contract('deploy'));
  markFormalA5Stage(manager, 'desktop-session-open');
  const failedStage = manager.receipt.stage;
  recordFormalA5Cleanup(manager, 'complete');
  failFormalA5Receipt(manager, new Error('desktop failed'), failedStage);
  expect(JSON.parse(fs.readFileSync(manager.path, 'utf8'))).toMatchObject({
    cleanup: { resultStatus: 'complete' }, failedStage: 'desktop-session-open',
    resultStatus: 'failed'
  });
});

it('prefers a bounded action failure stage over the controller fallback', () => {
  expect(formalA5FailureStage({ stage: 'desktop-session-open' }, 'action-running'))
    .toBe('desktop-session-open');
  expect(formalA5FailureStage({ stage: 'private/path' }, 'action-running'))
    .toBe('action-running');
});

it('uses the same full commit and tree identity contract as the Windows fixture', () => {
  const revision = 'a'.repeat(40); const tree = 'b'.repeat(40);
  expect(assertAcceptedSourceIdentity({ acceptedRevision: revision, acceptedTree: tree }))
    .toEqual({ revision, tree });
  expect(assertAcceptedSourceIdentity({ revision, treeDigest: tree }))
    .toEqual({ revision, tree });
  expect(() => assertAcceptedSourceIdentity({ revision: 'short', treeDigest: tree }))
    .toThrow('full commit and tree');
});

it('rejects a commit and tree mismatch before opening a receipt', () => {
  const { context } = fixture('build', 'afafafaf-afaf-afaf-afaf-afafafafafaf');
  expect(() => openFormalA5Receipt({ ...context, acceptedTree: 'd'.repeat(40) }, contract('build')))
    .toThrow('revision and tree do not match');
});

it('requires the registered target and evidence provenance', () => {
  const context = fixture('build', 'acacacac-acac-acac-acac-acacacacacac').context;
  expect(() => openFormalA5Receipt(context, {
    action: 'build', formalSourceClass: 'frozen-build'
  })).toThrow('action provenance is incomplete');
});

it('refuses a wrong fixed device and a mutation without backup integrity', () => {
  const context = fixture('deploy', 'adadadad-adad-adad-adad-adadadadadad').context;
  expect(() => openFormalA5Receipt(context, {
    ...contract('deploy'), formalTargetIdentity: 'another-device'
  })).toThrow('fixed A5 identity is invalid');

  const manager = openFormalA5Receipt(context, contract('deploy'));
  const lease = { owner: { acquiredAt: 'lease-start', mode: 'mutation', runId: context.runId } };
  recordFormalA5Lease(manager, lease);
  markFormalA5MutationBoundary(manager);
  const paths = { apk: path.join(context.sourceRepoRoot, 'app-debug.apk') };
  fs.writeFileSync(paths.apk, 'apk');
  expect(() => prepareFormalA5ReceiptCompletion(manager, context, paths))
    .toThrow('evidence locator is missing');
  fs.mkdirSync(path.join(context.artifactsRoot, 'a5-deploy', context.runId), { recursive: true });
  prepareFormalA5ReceiptCompletion(manager, context, paths);
  recordFormalA5LeaseReleased(manager, lease);
  recordFormalA5Cleanup(manager, 'complete');
  expect(() => completeFormalA5Receipt(manager)).toThrow('mutation trust is incomplete');
});

it('accepts trust facts without turning formal completion into sync success', () => {
  const { context, root } = fixture('deploy', 'aeaeaeae-aeae-aeae-aeae-aeaeaeaeaeae');
  const manager = openFormalA5Receipt(context, contract('deploy'));
  const lease = { owner: { acquiredAt: 'lease-start', mode: 'mutation', runId: context.runId } };
  recordFormalA5Lease(manager, lease);
  const manifest = path.join(root, 'baseline.json');
  fs.writeFileSync(manifest, JSON.stringify({ backup: { created: true, validated: true },
    snapshot: { database: { integrity: 'ok' }, serial: '87a33a4b' } }));
  recordFormalA5DataProtection(manager, manifest);
  markFormalA5MutationBoundary(manager);
  const buildRoot = path.join(root, 'capsule');
  const paths = { apk: path.join(buildRoot, 'android/app-debug.apk') };
  fs.mkdirSync(path.dirname(paths.apk), { recursive: true }); fs.writeFileSync(paths.apk, 'apk');
  fs.mkdirSync(path.join(context.artifactsRoot, 'a5-deploy', context.runId), { recursive: true });
  prepareFormalA5ReceiptCompletion(manager, context, paths);
  recordFormalA5LeaseReleased(manager, lease); recordFormalA5Cleanup(manager, 'complete');
  const receipt = completeFormalA5Receipt(manager);
  expect(receipt).toMatchObject({ dataProtection: { resultStatus: 'complete' },
    integrity: { database: 'ok' }, resultStatus: 'complete' });
  expect(receipt).not.toHaveProperty('syncSuccess');
});

it('completes source-free readonly receipts without claiming an accepted tip', () => {
  const { root } = fixture();
  const context = createMacosA5ExecutionContext({ action: 'status',
    formalSourceClass: 'source-free-readonly', repoRoot: root,
    runId: 'dddddddd-dddd-dddd-dddd-dddddddddddd' });
  const manager = openFormalA5Receipt(context, assertRegisteredMacosA5Action('status'));
  const lease = { owner: { acquiredAt: 'lease-start', mode: 'readonly-lifecycle',
    runId: context.runId } };
  recordFormalA5Lease(manager, lease);
  markFormalA5ActionRunning(manager);
  prepareFormalA5ReceiptCompletion(manager, context, { apk: '/missing' });
  recordFormalA5LeaseReleased(manager, lease);
  recordFormalA5Cleanup(manager, 'complete');
  const completed = completeFormalA5Receipt(manager);
  expect(completed).toMatchObject({ resultStatus: 'complete', source: {
    acceptedRevision: null, acceptedTree: null, formalSourceClass: 'source-free-readonly'
  }, target: { identity: '87a33a4b', kind: 'fixed-a5' } });
  expect(formalA5AcceptedTipLine(completed)).toBeNull();
});
