// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import { copyWindowsFrozenPreflightEvidence, parseWindowsFrozenPreflightEvidence } from
  './windows-frozen-revision-preflight-control.mjs';

it('accepts only the fixed Windows action evidence root', () => {
  const root = 'D:/C/foliole/.tmp/artifacts/windows-dev-action/run-1/frozen-revision-preflight';
  expect(parseWindowsFrozenPreflightEvidence(
    `[windows-dev-action] frozen-revision-preflight identity=attempt-1 receipt=${root}/receipt.json\n`
  )).toEqual({ attemptId: 'attempt-1', receiptPath: `${root}/receipt.json` });
  expect(() => parseWindowsFrozenPreflightEvidence(
    '[windows-dev-action] frozen-revision-preflight identity=x receipt=C:/private/receipt.json\n'
  )).toThrow('escaped');
});

it('copies and validates a complete revision-bound Windows receipt', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-frozen-control-'));
  const aggregateAttemptId = '20260828T010203456-12345678';
  const revision = 'a'.repeat(40);
  const tree = 'b'.repeat(40);
  const remoteRoot = `D:/C/foliole/.tmp/artifacts/windows-dev-action/run-1/frozen-revision-preflight`;
  const attemptIds = ['20260828T010203457-11111111', '20260828T010203458-22222222'];
  const attempts = attemptIds.map((attemptId, index) => ({
    attemptId, evidenceRoot: `${remoteRoot}/attempts/${attemptId}`.replaceAll('/', '\\'),
    receiptPath: `${remoteRoot}/attempts/${attemptId}/receipt.json`.replaceAll('/', '\\'),
    taskCopyRoot: `D:\\C\\foliole-state\\capsules\\${index}`
  }));
  const normalizedAttempts = attempts.map((attempt) => ({ ...attempt,
    evidenceRoot: attempt.evidenceRoot.replaceAll('\\', '/'),
    receiptPath: attempt.receiptPath.replaceAll('\\', '/') }));
  const aggregate = { aggregateAttemptId, attempts,
    cleanup: { resultStatus: 'complete' }, exit: { code: 0 },
    isolation: { distinctTaskCopies: true }, resultStatus: 'complete',
    source: { revision, tree } };
  const attemptReceipts = new Map(normalizedAttempts.map(({ attemptId, receiptPath }) => [receiptPath, {
    attemptId, build: { resultStatus: 'complete' }, cleanup: { resultStatus: 'complete' },
    dependencies: { resultStatus: 'complete' }, evidence: {
      root: `${remoteRoot}/attempts/${attemptId}`
    }, exit: { code: 0 }, nativeHealth: { resultStatus: 'complete' },
    resultStatus: 'complete', source: { revision, tree }
  }]));
  const copyFile = async (remote, local) => {
    const value = remote === `${remoteRoot}/receipt.json` ? aggregate : attemptReceipts.get(remote);
    fs.writeFileSync(local, value ? JSON.stringify(value) : 'evidence');
  };
  const copied = await copyWindowsFrozenPreflightEvidence({ copyFile,
    localCandidate: { revision, treeDigest: tree },
    output: `[windows-dev-action] frozen-revision-preflight identity=${aggregateAttemptId} receipt=${remoteRoot}/receipt.json\n`,
    repoRoot });
  expect(copied.attemptReceipt.resultStatus).toBe('complete');
  expect(fs.existsSync(path.join(copied.evidenceRoot, 'summary.json'))).toBe(true);
  fs.rmSync(repoRoot, { force: true, recursive: true });
});
