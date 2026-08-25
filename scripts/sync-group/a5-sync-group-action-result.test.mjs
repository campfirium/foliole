import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { runMacosA5SyncGroupMaintenance } from './a5-sync-group-action.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

function mechanics(receipt) {
  return vi.fn(async ({ evidenceRoot, validateInstrumentation }) => {
    fs.mkdirSync(evidenceRoot, { recursive: true });
    const evidencePath = path.join(evidenceRoot, 'raw.json');
    fs.writeFileSync(evidencePath, '{}\n');
    const stdout = [
      `INSTRUMENTATION_STATUS: folioleActionReceipt=${JSON.stringify(receipt)}`,
      'INSTRUMENTATION_STATUS: folioleAfterSemantic={}'
    ].join('\n');
    validateInstrumentation({ evidencePath, stdout });
    return { evidencePath, output: '', stdout };
  });
}

function args(receipt) {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a5-sync-result-'));
  roots.push(evidenceRoot);
  return {
    action: 'sync-now', buildIdentity: 'candidate', env: {}, evidenceRoot,
    execute: vi.fn(), mechanics: mechanics(receipt), paths: {}, serial: 'a5'
  };
}

it('rejects a public Sync Now action that reaches a failed terminal result', async () => {
  await expect(runMacosA5SyncGroupMaintenance(args({
    actionStarted: true, actionRunId: 'run-1', errorText: 'No member is reachable.',
    terminalResult: 'failed', terminalRunId: 'run-1'
  }))).rejects.toMatchObject({
    failureAxis: 'proof', productError: 'No member is reachable.', terminalResult: 'failed'
  });
});

it('accepts a public Sync Now action only when its matching run completes', async () => {
  await expect(runMacosA5SyncGroupMaintenance(args({
    actionStarted: true, actionRunId: 'run-1', errorText: '',
    terminalResult: 'completed', terminalRunId: 'run-1'
  }))).resolves.toMatchObject({ manifestPath: expect.any(String) });
});
