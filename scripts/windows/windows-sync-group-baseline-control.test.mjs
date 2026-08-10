import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { runWindowsSyncGroupBaselineControl } from './windows-sync-group-baseline-control.mjs';

it('pushes the frozen dev candidate and copies only fixed Windows C baseline evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't121-windows-control-'));
  const remote = 'C:\\dev\\foliole-android-lab-preview\\.tmp\\artifacts\\windows-dev-action\\run-1';
  const output = `[windows-dev-action] sync-group-baseline-reset identity=run-1 manifest=${remote}\\sync-group-baseline-reset-manifest.json\n`;
  const executeGit = vi.fn(async () => 'pushed');
  const executeScp = vi.fn(async (args) => { fs.writeFileSync(args.at(-1), '{}'); });
  const result = await runWindowsSyncGroupBaselineControl({
    buildPushSpec: () => ({ args: ['push'], env: {} }),
    buildScpSpec: (_host, _remote, local) => ['copy', local], buildSshSpec: () => ['ssh'],
    env: {}, executeGit, executeScp, executeSsh: async () => output, host: 'user@host',
    repoRoot: root, stdout: { write: () => undefined }
  });
  expect(executeGit).toHaveBeenCalledOnce();
  expect(executeScp).toHaveBeenCalledTimes(2);
  expect(result.evidenceRoot).toContain(path.join('sync-group-baseline-reset', 'run-1'));
});
