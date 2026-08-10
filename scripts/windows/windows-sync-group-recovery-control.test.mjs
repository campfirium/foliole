import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { runWindowsSyncGroupRecoveryControl } from './windows-sync-group-recovery-control.mjs';

it('coordinates Mac-owned A5 approval with the fixed Windows C action', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-group-control-'));
  const remoteRoot = 'C:\\dev\\foliole-android-lab-preview\\.tmp\\artifacts\\windows-dev-action\\run-1';
  const output = `[windows-dev-action] sync-group-recover identity=run-1 manifest=${remoteRoot}\\sync-group-recovery-receipt.json\n`;
  const executeGit = vi.fn(async () => 'pushed');
  const executeSsh = vi.fn(async () => output);
  const executeScp = vi.fn(async (args) => { fs.writeFileSync(args.at(-1), '{}'); return ''; });
  const order = [];
  const approve = vi.fn(async ({ onReady }) => {
    order.push('a5-ready');
    await onReady();
    order.push('approval-finished');
    return { output: 'approved\n' };
  });
  const writes = [];
  const result = await runWindowsSyncGroupRecoveryControl({
    approve, buildPushSpec: () => ({ args: ['push'], env: {} }),
    buildScpSpec: (_host, _remote, local) => ['copy', local], buildSshSpec: () => ['ssh'],
    env: {}, executeGit, executeScp, executeSsh, host: 'user@host', repoRoot: root,
    stdout: { write: (value) => writes.push(value) }
  });
  expect(approve).toHaveBeenCalledOnce();
  expect(executeGit).toHaveBeenCalledOnce();
  expect(executeSsh).toHaveBeenCalledOnce();
  expect(order).toEqual(['a5-ready', 'approval-finished']);
  expect(result.evidenceRoot).toContain(path.join('sync-group-recovery', 'run-1'));
  expect(writes.join('')).toContain('approved');
});
