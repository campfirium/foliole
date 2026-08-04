// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { runWindowsDevControl } from './windows-dev-control.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture(label) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), label));
  roots.push(repoRoot);
  const executeScp = vi.fn(async (args) => {
    fs.writeFileSync(args.at(-1), '{}');
    return '';
  });
  return { executeScp, repoRoot };
}

it('copies the fixed minimal pair recovery receipt set', async () => {
  const { executeScp, repoRoot } = fixture('pair-control-');
  const remoteRoot = 'C:/dev/foliole-android-lab-preview/.tmp/artifacts/windows-dev-action/pair-1';
  const result = await runWindowsDevControl({
    argv: ['--host', 'v\\dev@192.168.0.11', 'pair-sync-recover'], env: {},
    executeGit: vi.fn(async () => ''), executeScp,
    executeSsh: vi.fn(async () =>
      `[windows-dev-action] pair-sync-recover identity=pair-1 manifest=${remoteRoot}/pair-sync-recovery-manifest.json\n`),
    repoRoot, stdout: { write: vi.fn() }
  });
  expect(result).toMatchObject({ action: 'pair-sync-recover', manifestPath: expect.stringContaining('manifest.json') });
  expect(executeScp).toHaveBeenCalledTimes(6);
  expect(executeScp.mock.calls.map(([args]) => path.basename(args.at(-1)))).not.toContain('action.log');
});

it('copies only a scrubbed summary when pair recovery stops', async () => {
  const { executeScp, repoRoot } = fixture('pair-control-failure-');
  const remoteRoot = 'C:/dev/foliole-android-lab-preview/.tmp/artifacts/windows-dev-action/pair-2';
  const output = `[windows-dev-action] status: FAILED exit=77 evidence=${remoteRoot}/summary.json\n`;
  const remoteError = Object.assign(new Error('remote failed'), { output });
  await expect(runWindowsDevControl({
    argv: ['--host', 'v\\dev@192.168.0.11', 'pair-sync-recover'], env: {},
    executeGit: vi.fn(async () => ''), executeScp,
    executeSsh: vi.fn(async () => { throw remoteError; }), repoRoot, stdout: { write: vi.fn() }
  })).rejects.toBe(remoteError);
  expect(executeScp.mock.calls.map(([args]) => path.basename(args.at(-1)))).toEqual(['summary.json']);
});
