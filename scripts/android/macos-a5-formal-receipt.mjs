/* global process */

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const RECEIPT_FILE = 'formal-run-receipt.json';
const CONTROLLER_FILES = [
  'scripts/android/macos-a5-dev.mjs',
  'scripts/android/macos-a5-action-registry.mjs',
  'scripts/android/macos-a5-build-capsule.mjs',
  'scripts/android/macos-a5-formal-candidate.mjs',
  'scripts/android/macos-a5-formal-receipt.mjs'
];
const FULL_SHA = /^[0-9a-f]{40}$/u;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function atomicWriteJson(filePath, value, fsApi = fs) {
  fsApi.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  fsApi.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx'
  });
  fsApi.renameSync(temporaryPath, filePath);
}

function gitFile(context, file, execute = execFileSync) {
  return execute('git', ['show', `${context.acceptedRevision}:${file}`], {
    cwd: context.sourceRepoRoot
  });
}

function verifyAcceptedTree(context, execute = execFileSync) {
  const tree = execute('git', ['rev-parse', '--verify', `${context.acceptedRevision}^{tree}`], {
    cwd: context.sourceRepoRoot, encoding: 'utf8'
  }).trim();
  if (tree !== context.acceptedTree) throw new Error('Accepted revision and tree do not match.');
}

function controllerDigests(context, fsApi = fs) {
  return Object.fromEntries(CONTROLLER_FILES.map((file) => [
    file, sha256(fsApi.readFileSync(path.join(context.sourceRepoRoot, file)))
  ]));
}

export function assertAcceptedSourceIdentity(identity) {
  const revision = identity.acceptedRevision ?? identity.revision;
  const tree = identity.acceptedTree ?? identity.treeDigest;
  if (!FULL_SHA.test(revision ?? '') || !FULL_SHA.test(tree ?? '')) {
    throw new Error('Accepted source identity requires a full commit and tree SHA.');
  }
  return { revision, tree };
}

export function formalReceiptPath(context) {
  return path.join(context.artifactsRoot, 'macos-a5-formal', context.runId, RECEIPT_FILE);
}

export function openFormalA5Receipt(context, actionContract, {
  executeGit = execFileSync, fsApi = fs, now = () => new Date().toISOString()
} = {}) {
  if (actionContract.action !== context.action
      || actionContract.formalSourceClass !== context.formalSourceClass) {
    throw new Error('Formal receipt action contract does not match the run context.');
  }
  const frozen = context.formalSourceClass === 'frozen-build';
  if (frozen) {
    assertAcceptedSourceIdentity(context);
    verifyAcceptedTree(context, executeGit);
  }
  const receipt = {
    action: context.action,
    actionEvidence: { locator: formalReceiptPath(context), runId: context.runId },
    apk: null,
    controllerDigests: controllerDigests(context, fsApi),
    failure: null,
    lockfileDigest: frozen ? sha256(gitFile(context, 'package-lock.json', executeGit)) : null,
    mutationBoundary: { crossed: false, crossedAt: null },
    resultStatus: 'pending',
    runId: context.runId,
    schemaVersion: 1,
    source: { acceptedRevision: context.acceptedRevision, acceptedTree: context.acceptedTree,
      formalSourceClass: context.formalSourceClass },
    stage: 'pending',
    startedAt: now(),
    toolchain: null
  };
  const manager = { fsApi, now, path: formalReceiptPath(context), receipt };
  atomicWriteJson(manager.path, receipt, fsApi);
  return manager;
}

function update(manager, patch) {
  if (manager.receipt.resultStatus !== 'pending') {
    throw new Error('A finalized formal receipt cannot be changed.');
  }
  manager.receipt = { ...manager.receipt, ...patch };
  atomicWriteJson(manager.path, manager.receipt, manager.fsApi);
  return manager.receipt;
}

function version(command, args, options, run) {
  const result = run(command, args, { ...options, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Toolchain capture failed for ${path.basename(command)}.`);
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  const lines = output.split(/\r?\n/u).filter(Boolean);
  return lines.find((line) => /\d/u.test(line)) ?? lines[0] ?? '';
}

export function captureFormalA5Toolchain(manager, paths, run = spawnSync) {
  return update(manager, { stage: 'toolchain-captured', toolchain: {
    adb: version(paths.adb, ['version'], {}, run),
    capacitor: version(paths.cap, ['--version'], { cwd: paths.buildRoot }, run),
    gradle: version(paths.gradle, ['--version'], { cwd: path.join(paths.buildRoot, 'android') }, run),
    java: version(paths.java, ['-version'], {}, run),
    node: process.version,
    npm: version('npm', ['--version'], { cwd: paths.buildRoot }, run)
  } });
}

export function markFormalA5MutationBoundary(manager) {
  if (manager.receipt.mutationBoundary.crossed) return manager.receipt;
  return update(manager, { mutationBoundary: {
    crossed: true, crossedAt: manager.now()
  }, stage: 'action-running' });
}

export function markFormalA5ActionRunning(manager) {
  return update(manager, { stage: 'action-running' });
}

export function markFormalA5Stage(manager, stage) {
  return update(manager, { stage });
}

export function formalA5ActionEvidenceLocator(context) {
  if (context.action === 'clear-app-data') {
    return path.join(context.artifactsRoot, 'a5-clear-app-data', `${context.runId}.json`);
  }
  const roots = {
    'capture-annotation': 'a5-capture-annotation',
    'clear-app-data': 'a5-clear-app-data',
    'database-performance': 'companion-database-performance',
    deploy: 'a5-deploy',
    'device-profile': 'a5-device-profile',
    'leave-sync-group': 'a5-sync-group-maintenance',
    'pair-credentials': 'a5-pair-credentials',
    'pair-sync': 'a5-pair-sync',
    'sync-existing': 'a5-existing-sync',
    'sync-group-rejoin': 'a5-sync-group-rejoin',
    'sync-group-rejoin-recover': 'a5-sync-group-rejoin-recovery'
  };
  const root = roots[context.action];
  return root ? path.join(context.artifactsRoot, root, context.runId) : formalReceiptPath(context);
}

export function prepareFormalA5ReceiptCompletion(manager, context, paths, fsApi = fs) {
  const frozen = context.formalSourceClass === 'frozen-build';
  if (frozen && !fsApi.existsSync(paths.apk)) throw new Error('Formal action APK evidence is missing.');
  const locator = formalA5ActionEvidenceLocator(context);
  if (!fsApi.existsSync(locator)) throw new Error('Formal action evidence locator is missing.');
  return update(manager, {
    actionEvidence: { locator, runId: context.runId },
    apk: frozen ? { digest: sha256(fsApi.readFileSync(paths.apk)),
      projectRelativePath: 'android/app/build/outputs/apk/debug/app-debug.apk' } : null,
    stage: 'action-complete'
  });
}

export function failFormalA5Receipt(manager, error) {
  const failure = { code: typeof error?.code === 'string' ? error.code : 'formal_action_failed',
    messageDigest: sha256(error instanceof Error ? error.message : String(error)) };
  return update(manager, { completedAt: manager.now(), failure,
    failedStage: manager.receipt.stage, resultStatus: 'failed', stage: 'failed' });
}

export function completeFormalA5Receipt(manager) {
  return update(manager, { completedAt: manager.now(), resultStatus: 'complete',
    stage: 'complete' });
}

export function formalA5AcceptedTipLine(receipt) {
  if (receipt.resultStatus !== 'complete') {
    throw new Error('Accepted tip requires a complete formal receipt.');
  }
  if (receipt.source.formalSourceClass !== 'frozen-build') return null;
  const revision = assertAcceptedSourceIdentity(receipt.source).revision;
  return `[macos-a5-dev] accepted-tip=${revision}\n`;
}
