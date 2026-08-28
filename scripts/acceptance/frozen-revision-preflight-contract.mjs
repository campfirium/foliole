/* global process */

import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const ATTEMPT_PATTERN = /^\d{8}T\d{9}-[0-9a-f]{8}$/u;

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function createFrozenAttemptId({
  id = randomUUID, now = () => new Date()
} = {}) {
  const timestamp = now().toISOString().replace(/[-:.Z]/gu, '');
  return `${timestamp}-${id().slice(0, 8)}`;
}

export function assertFrozenSource(source) {
  if (!SHA_PATTERN.test(source?.revision ?? '') || !SHA_PATTERN.test(source?.tree ?? '')) {
    throw new Error('Frozen revision preflight requires full revision and tree identities.');
  }
  return source;
}

export function assertFrozenAttemptId(attemptId) {
  if (!ATTEMPT_PATTERN.test(attemptId ?? '')) {
    throw new Error('Frozen revision preflight attempt identity is invalid.');
  }
  return attemptId;
}

export function atomicWriteJson(filePath, value, fsApi = fs) {
  fsApi.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  fsApi.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx'
  });
  fsApi.renameSync(temporaryPath, filePath);
}

export function openFrozenPreflightReceipt({ attemptId, evidenceRoot, host, source }, {
  fsApi = fs, now = () => new Date().toISOString()
} = {}) {
  assertFrozenAttemptId(attemptId);
  assertFrozenSource(source);
  fsApi.mkdirSync(evidenceRoot, { recursive: false });
  const receiptPath = path.join(evidenceRoot, 'receipt.json');
  const receipt = {
    attemptId,
    build: { resultStatus: 'pending' },
    cleanup: { resultStatus: 'pending' },
    dependencies: { lockfileDigest: null, resultStatus: 'pending' },
    evidence: { locator: receiptPath, root: evidenceRoot },
    exit: { code: null, stage: 'opened' },
    failure: null,
    host,
    nativeHealth: { resultStatus: 'pending' },
    resourceLock: null,
    resultStatus: 'pending',
    schemaVersion: 1,
    source,
    startedAt: now(),
    taskCopy: { root: null, sourceArchiveDigest: null }
  };
  atomicWriteJson(receiptPath, receipt, fsApi);
  return { fsApi, now, receipt, receiptPath };
}

export function updateFrozenPreflightReceipt(manager, patch) {
  if (manager.receipt.resultStatus !== 'pending') {
    throw new Error('A finalized frozen revision receipt cannot be changed.');
  }
  manager.receipt = { ...manager.receipt, ...patch };
  atomicWriteJson(manager.receiptPath, manager.receipt, manager.fsApi);
  return manager.receipt;
}

export function failFrozenPreflightReceipt(manager, error, stage) {
  const message = error instanceof Error ? error.message : String(error);
  return updateFrozenPreflightReceipt(manager, {
    completedAt: manager.now(),
    exit: { code: Number.isInteger(error?.exitCode) ? error.exitCode : 1, stage },
    failure: { messageDigest: sha256(message), stage },
    resultStatus: 'failed'
  });
}

export function completeFrozenPreflightReceipt(manager) {
  const receipt = manager.receipt;
  if (receipt.resultStatus !== 'pending') {
    throw new Error('A finalized frozen revision receipt cannot be changed.');
  }
  if (receipt.build.resultStatus !== 'complete'
      || receipt.dependencies.resultStatus !== 'complete'
      || receipt.nativeHealth.resultStatus !== 'complete'
      || receipt.cleanup.resultStatus !== 'complete'
      || !/^[0-9a-f]{64}$/u.test(receipt.taskCopy.sourceArchiveDigest ?? '')) {
    throw new Error('Frozen revision preflight receipt is incomplete.');
  }
  return updateFrozenPreflightReceipt(manager, {
    completedAt: manager.now(), exit: { code: 0, stage: 'complete' }, resultStatus: 'complete'
  });
}

export function assertCompleteFrozenPreflightReceipt(receipt, expected) {
  assertFrozenSource(receipt?.source);
  if (receipt.resultStatus !== 'complete' || receipt.exit?.code !== 0
      || receipt.source.revision !== expected.revision || receipt.source.tree !== expected.tree
      || receipt.cleanup?.resultStatus !== 'complete'
      || receipt.attemptId !== path.basename(String(receipt.evidence?.root ?? '').replaceAll('\\', '/'))) {
    throw new Error('Frozen revision preflight receipt does not match the accepted source.');
  }
  return receipt;
}
