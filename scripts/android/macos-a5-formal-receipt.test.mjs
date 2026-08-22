// @vitest-environment node
/* global process */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { createMacosA5ExecutionContext } from './macos-a5-execution-context.mjs';
import {
  assertAcceptedSourceIdentity, captureFormalA5Toolchain, completeFormalA5Receipt,
  failFormalA5Receipt, formalA5AcceptedTipLine, formalA5FailureStage,
  markFormalA5ActionRunning,
  markFormalA5MutationBoundary, markFormalA5Stage,
  openFormalA5Receipt, prepareFormalA5ReceiptCompletion, recordFormalA5Cleanup
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
  for (const file of [
    'scripts/android/macos-a5-dev.mjs', 'scripts/android/macos-a5-action-registry.mjs',
    'scripts/android/macos-a5-build-capsule.mjs',
    'scripts/android/macos-a5-extended-actions.mjs',
    'scripts/android/macos-a5-formal-candidate.mjs',
    'scripts/android/macos-a5-formal-receipt.mjs',
    'scripts/android/macos-a5-runtime-paths.mjs'
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), `${file}\n`);
  }
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  git(root, ['init', '-b', 'dev']);
  git(root, ['config', 'user.email', 'receipt@example.invalid']);
  git(root, ['config', 'user.name', 'Receipt Test']);
  git(root, ['add', '.']); git(root, ['commit', '-m', 'fixture']);
  const acceptedRevision = git(root, ['rev-parse', 'HEAD']);
  const acceptedTree = git(root, ['rev-parse', 'HEAD^{tree}']);
  const context = createMacosA5ExecutionContext({ acceptedRevision, acceptedTree, action,
    formalSourceClass: 'frozen-build', repoRoot: root, runId });
  return { context, root };
}

function contract(action) {
  return { action, formalSourceClass: 'frozen-build' };
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
  recordFormalA5Cleanup(manager, 'complete');
  const completed = completeFormalA5Receipt(manager);
  expect(formalA5AcceptedTipLine(completed))
    .toBe(`[macos-a5-dev] accepted-tip=${context.acceptedRevision}\n`);

  const receipt = JSON.parse(fs.readFileSync(manager.path, 'utf8'));
  expect(receipt).toMatchObject({ action: 'build', resultStatus: 'complete',
    runId: context.runId, stage: 'complete', source: {
      acceptedRevision: context.acceptedRevision, acceptedTree: context.acceptedTree
    } });
  expect(receipt.lockfileDigest).toMatch(/^[0-9a-f]{64}$/u);
  expect(receipt.apk.digest).toMatch(/^[0-9a-f]{64}$/u);
  expect(receipt.actionEvidence.runId).toBe(context.runId);
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
  expect(manager.receipt.toolchain.electron).toEqual({
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

it('completes source-free readonly receipts without claiming an accepted tip', () => {
  const { root } = fixture();
  const context = createMacosA5ExecutionContext({ action: 'status',
    formalSourceClass: 'source-free-readonly', repoRoot: root,
    runId: 'dddddddd-dddd-dddd-dddd-dddddddddddd' });
  const manager = openFormalA5Receipt(context, {
    action: 'status', formalSourceClass: 'source-free-readonly'
  });
  markFormalA5ActionRunning(manager);
  prepareFormalA5ReceiptCompletion(manager, context, { apk: '/missing' });
  recordFormalA5Cleanup(manager, 'complete');
  const completed = completeFormalA5Receipt(manager);
  expect(completed).toMatchObject({ resultStatus: 'complete', source: {
    acceptedRevision: null, acceptedTree: null, formalSourceClass: 'source-free-readonly'
  } });
  expect(formalA5AcceptedTipLine(completed)).toBeNull();
});
