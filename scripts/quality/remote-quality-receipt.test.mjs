// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { writeRemoteQualityReceipt } from './remote-quality-receipt.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';

function options(cwd, conclusion = 'success') {
  return {
    cwd,
    jobs: [{ html_url: 'https://github.test/jobs/7', id: 7, name: 'iOS contract',
      steps: [{ conclusion, name: 'Verify target SHA', status: 'completed' }] }],
    runId: 42,
    scope: 'ios',
    sourceRef: 'refs/heads/sync',
    targetSha: SHA,
    url: 'https://github.test/runs/42'
  };
}

it('writes exact sync SHA evidence from a successful hosted checkout check', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-remote-quality-'));
  const receiptPath = writeRemoteQualityReceipt(options(root));
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  expect(receipt).toMatchObject({
    dispatchRef: 'refs/heads/dev', resultStatus: 'success', sourceRef: 'refs/heads/sync',
    targetSha: SHA
  });
  expect(receipt.shaChecks).toEqual([expect.objectContaining({ conclusion: 'success', jobId: 7 })]);
});

it('rejects missing or failed target SHA verification evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-remote-quality-'));
  expect(() => writeRemoteQualityReceipt(options(root, 'failure'))).toThrow('target SHA verification');
  expect(() => writeRemoteQualityReceipt({ ...options(root), jobs: [] }))
    .toThrow('target SHA verification');
});
