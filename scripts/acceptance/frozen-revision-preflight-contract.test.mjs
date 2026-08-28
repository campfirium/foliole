// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import {
  assertCompleteFrozenPreflightReceipt, completeFrozenPreflightReceipt,
  createFrozenAttemptId, failFrozenPreflightReceipt, openFrozenPreflightReceipt,
  updateFrozenPreflightReceipt
} from './frozen-revision-preflight-contract.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frozen-preflight-'));
  roots.push(root);
  const attemptId = createFrozenAttemptId({ id: () => '12345678-rest',
    now: () => new Date('2026-08-28T01:02:03.456Z') });
  const source = { revision: 'a'.repeat(40), tree: 'b'.repeat(40) };
  return { attemptId, evidenceRoot: path.join(root, attemptId), source };
}

it('accepts only a complete receipt bound to one unique attempt root and source', () => {
  const input = fixture();
  const manager = openFrozenPreflightReceipt({ ...input, host: 'macos' });
  updateFrozenPreflightReceipt(manager, {
    build: { resultStatus: 'complete' }, cleanup: { resultStatus: 'complete' },
    dependencies: { lockfileDigest: 'c'.repeat(64), resultStatus: 'complete' },
    nativeHealth: { resultStatus: 'complete' },
    taskCopy: { root: '/owned/copy', sourceArchiveDigest: 'd'.repeat(64) }
  });
  const receipt = completeFrozenPreflightReceipt(manager);
  expect(assertCompleteFrozenPreflightReceipt(receipt, input.source)).toBe(receipt);
  const windowsReceipt = { ...receipt, evidence: {
    ...receipt.evidence, root: `D:\\evidence\\${receipt.attemptId}`
  } };
  expect(assertCompleteFrozenPreflightReceipt(windowsReceipt, input.source)).toBe(windowsReceipt);
  expect(() => assertCompleteFrozenPreflightReceipt(receipt, {
    ...input.source, revision: 'e'.repeat(40)
  })).toThrow('does not match');
});

it('finalizes failure without allowing it to become a later success', () => {
  const input = fixture();
  const manager = openFrozenPreflightReceipt({ ...input, host: 'windows' });
  const receipt = failFrozenPreflightReceipt(manager, new Error('native failed'), 'native-health');
  expect(receipt).toMatchObject({ resultStatus: 'failed', exit: { code: 1, stage: 'native-health' } });
  expect(() => completeFrozenPreflightReceipt(manager)).toThrow('finalized');
  expect(() => openFrozenPreflightReceipt({ ...input, host: 'windows' })).toThrow();
});
