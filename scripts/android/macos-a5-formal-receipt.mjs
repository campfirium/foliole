/* global process */

import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  acceptedSourceReceipt, assertAcceptedSourceIdentity
} from './macos-a5-formal-source.mjs';

export { assertAcceptedSourceIdentity } from './macos-a5-formal-source.mjs';

const RECEIPT_FILE = 'formal-run-receipt.json';

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

export function formalReceiptPath(context) {
  return path.join(context.artifactsRoot, 'macos-a5-formal', context.runId, RECEIPT_FILE);
}

export function openFormalA5Receipt(context, actionContract, {
  executeGit, fsApi = fs, now = () => new Date().toISOString()
} = {}) {
  if (actionContract.action !== context.action
      || actionContract.formalSourceClass !== context.formalSourceClass) {
    throw new Error('Formal receipt action contract does not match the run context.');
  }
  if (!actionContract.formalEvidence || typeof actionContract.formalTarget !== 'string'
      || typeof actionContract.formalTargetIdentity !== 'string') {
    throw new Error('Formal receipt action provenance is incomplete.');
  }
  if (actionContract.formalTarget === 'fixed-a5'
      && actionContract.formalTargetIdentity !== '87a33a4b') {
    throw new Error('Formal receipt fixed A5 identity is invalid.');
  }
  const accepted = acceptedSourceReceipt(context, executeGit);
  const requiresDataProtection = actionContract.requiresDataProtection
    ?? actionContract.mutatesFixedA5;
  const receipt = {
    action: context.action,
    apk: null,
    cleanup: { completedAt: null, resultStatus: 'pending' },
    dataProtection: { manifestDigest: null, required: requiresDataProtection,
      resultStatus: requiresDataProtection ? 'pending' : 'not-required' },
    diagnostics: { toolchain: null },
    evidence: { locator: formalReceiptPath(context), runId: context.runId, verifiedAt: null },
    failure: null,
    lockfileDigest: accepted.lockfileDigest,
    mutationBoundary: { crossed: false, crossedAt: null },
    integrity: { database: null,
      resultStatus: requiresDataProtection ? 'pending' : 'not-required' },
    lease: { acquiredAt: null, mode: actionContract.deviceLeaseMode,
      releasedAt: null, runId: null },
    resultStatus: 'pending',
    runId: context.runId,
    schemaVersion: 2,
    source: accepted.source,
    stage: 'pending',
    startedAt: now(),
    target: { identity: actionContract.formalTargetIdentity, kind: actionContract.formalTarget }
  };
  const manager = { actionContract, fsApi, now, path: formalReceiptPath(context), receipt };
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
  if (result.status !== 0) return null;
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  const lines = output.split(/\r?\n/u).filter(Boolean);
  return lines.find((line) => /\d/u.test(line)) ?? lines[0] ?? '';
}

function hiddenElectronIdentity(paths, fsApi = fs) {
  if (!paths.requiresHiddenDesktopRuntime) return null;
  const metadata = JSON.parse(fsApi.readFileSync(paths.electronPackage, 'utf8'));
  return { executableDigest: sha256(fsApi.readFileSync(paths.electron)),
    version: metadata.version };
}

export function captureFormalA5Toolchain(manager, paths, run = spawnSync, fsApi = fs) {
  return update(manager, { diagnostics: { ...manager.receipt.diagnostics, toolchain: {
    adb: version(paths.adb, ['version'], {}, run),
    capacitor: version(paths.cap, ['--version'], { cwd: paths.buildRoot }, run),
    electron: hiddenElectronIdentity(paths, fsApi),
    gradle: version(paths.gradle, ['--version'], { cwd: path.join(paths.buildRoot, 'android') }, run),
    java: version(paths.java, ['-version'], {}, run),
    node: process.version,
    npm: version('npm', ['--version'], { cwd: paths.buildRoot }, run)
  } }, stage: 'toolchain-captured' });
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

export function recordFormalA5Lease(manager, lease) {
  if (lease?.owner?.runId !== manager.receipt.runId
      || lease.owner.mode !== manager.receipt.lease.mode) {
    throw new Error('Formal A5 lease does not match the run.');
  }
  return update(manager, { lease: { ...manager.receipt.lease,
    acquiredAt: lease.owner.acquiredAt, runId: lease.owner.runId } });
}

export function recordFormalA5LeaseReleased(manager, lease) {
  if (lease?.owner?.runId !== manager.receipt.lease.runId) {
    throw new Error('Formal A5 released lease does not match the run.');
  }
  return update(manager, { lease: { ...manager.receipt.lease,
    releasedAt: manager.now() } });
}

export function recordFormalA5DataProtection(manager, manifestPath, fsApi = fs) {
  const manifest = JSON.parse(fsApi.readFileSync(manifestPath, 'utf8'));
  if (manifest.backup?.created !== true || manifest.backup?.validated !== true
      || manifest.snapshot?.database?.integrity !== 'ok'
      || manifest.snapshot?.serial !== manager.receipt.target.identity) {
    throw new Error('Formal A5 data protection evidence is incomplete.');
  }
  return update(manager, {
    dataProtection: { manifestDigest: sha256(fsApi.readFileSync(manifestPath)),
      required: true, resultStatus: 'complete' },
    integrity: { database: 'ok', resultStatus: 'complete' }
  });
}

export function recordFormalA5Cleanup(manager, resultStatus) {
  return update(manager, { cleanup: { completedAt: manager.now(), resultStatus } });
}

export function formalA5FailureStage(error, fallback) {
  return typeof error?.stage === 'string' && /^[a-z][a-z0-9-]{0,63}$/u.test(error.stage)
    ? error.stage : fallback;
}

function formalA5EvidenceLocator(context, descriptor) {
  if (descriptor.kind === 'receipt') return formalReceiptPath(context);
  if (descriptor.kind === 'run-directory') {
    return path.join(context.artifactsRoot, descriptor.root, context.runId);
  }
  if (descriptor.kind === 'run-json') {
    return path.join(context.artifactsRoot, descriptor.root, `${context.runId}.json`);
  }
  throw new Error('Formal action evidence contract is unsupported.');
}

export function prepareFormalA5ReceiptCompletion(manager, context, paths, fsApi = fs) {
  const frozen = context.formalSourceClass === 'frozen-build';
  if (frozen && !fsApi.existsSync(paths.apk)) throw new Error('Formal action APK evidence is missing.');
  const locator = formalA5EvidenceLocator(context, manager.actionContract.formalEvidence);
  if (!fsApi.existsSync(locator)) throw new Error('Formal action evidence locator is missing.');
  return update(manager, {
    evidence: { locator, runId: context.runId, verifiedAt: manager.now() },
    apk: frozen ? { digest: sha256(fsApi.readFileSync(paths.apk)),
      projectRelativePath: 'android/app/build/outputs/apk/debug/app-debug.apk' } : null,
    source: { ...manager.receipt.source,
      archiveDigest: frozen ? context.sourceArchiveDigest : null },
    stage: 'action-complete'
  });
}

export function failFormalA5Receipt(manager, error,
  failedStage = formalA5FailureStage(error, manager.receipt.stage)) {
  const failure = { code: typeof error?.code === 'string' ? error.code : 'formal_action_failed',
    messageDigest: sha256(error instanceof Error ? error.message : String(error)) };
  return update(manager, { completedAt: manager.now(), failure,
    failedStage, resultStatus: 'failed', stage: 'failed' });
}

export function completeFormalA5Receipt(manager) {
  if (manager.receipt.resultStatus !== 'pending') {
    throw new Error('A finalized formal receipt cannot be changed.');
  }
  if (manager.receipt.cleanup.resultStatus !== 'complete') {
    throw new Error('Formal receipt cannot complete before controller cleanup.');
  }
  const { receipt } = manager;
  if (receipt.source.formalSourceClass === 'frozen-build'
      && !/^[0-9a-f]{64}$/u.test(receipt.source.archiveDigest ?? '')) {
    throw new Error('Formal receipt source archive identity is incomplete.');
  }
  if (!receipt.evidence.verifiedAt || receipt.evidence.runId !== receipt.runId) {
    throw new Error('Formal receipt evidence locator is incomplete.');
  }
  if (receipt.lease.mode && (!receipt.lease.acquiredAt || !receipt.lease.releasedAt
      || receipt.lease.runId !== receipt.runId)) {
    throw new Error('Formal receipt lease lifecycle is incomplete.');
  }
  if (receipt.dataProtection.required && (receipt.dataProtection.resultStatus !== 'complete'
      || receipt.integrity.resultStatus !== 'complete'
      || receipt.mutationBoundary.crossed !== true)) {
    throw new Error('Formal receipt mutation trust is incomplete.');
  }
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
