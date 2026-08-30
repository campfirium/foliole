// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import {
  runWindowsDefaultSyncJourney,
  WINDOWS_DEFAULT_SYNC_JOURNEY_SCREENSHOTS
} from './windows-default-sync-journey-action.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

it('runs the hidden native journey directly from the current Windows checkout', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-default-sync-journey-'));
  roots.push(repoRoot);
  const evidenceRoot = path.join(repoRoot, '.tmp', 'artifacts', 'windows-dev-action', 'run-1');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const execute = vi.fn(async (_command, _args, options) => {
    for (const name of WINDOWS_DEFAULT_SYNC_JOURNEY_SCREENSHOTS) {
      fs.writeFileSync(path.join(options.env.FOLIOLE_T160_EVIDENCE_ROOT, name), 'png');
    }
    return { code: 0, lines: ['passed'], output: 'passed\n', stderr: '', stdout: 'passed\n' };
  });
  const checked = async (executor, command, args, options) => executor(command, args, options);
  const result = await runWindowsDefaultSyncJourney({ checked, evidenceRoot, execute,
    paths: { repoRoot, systemNode: 'node.exe' } });

  expect(execute).toHaveBeenCalledOnce();
  expect(execute.mock.calls[0][1]).toContain(
    'tests/desktop/t160-windows-default-sync-journey.spec.ts'
  );
  expect(execute.mock.calls[0][1].at(-1)).not.toContain('\\');
  expect(execute.mock.calls[0][2]).toMatchObject({
    cwd: repoRoot,
    env: { FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: '1', FOLIOLE_T160_EVIDENCE_ROOT: evidenceRoot },
    timeoutMs: 30 * 60_000
  });
  expect(result).toEqual({ output: 'passed\n' });
  expect(fs.readdirSync(evidenceRoot).sort())
    .toEqual([...WINDOWS_DEFAULT_SYNC_JOURNEY_SCREENSHOTS].sort());
});

it('fails instead of accepting an incomplete screenshot set', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-default-sync-incomplete-'));
  roots.push(repoRoot);
  const evidenceRoot = path.join(repoRoot, 'evidence');
  fs.mkdirSync(evidenceRoot);
  const execute = vi.fn(async () => ({
    code: 0, lines: [], output: 'passed\n', stderr: '', stdout: 'passed\n'
  }));
  const checked = async (executor, command, args, options) => executor(command, args, options);
  await expect(runWindowsDefaultSyncJourney({ checked, evidenceRoot, execute,
    paths: { repoRoot, systemNode: 'node.exe' } }))
    .rejects.toThrow('did not produce t160-before-workspace.png');
});
