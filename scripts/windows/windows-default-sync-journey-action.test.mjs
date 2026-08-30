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

it('binds the hidden native journey and fixed evidence to the checkout revision', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-default-sync-journey-'));
  roots.push(repoRoot);
  const evidenceRoot = path.join(repoRoot, '.tmp', 'artifacts', 'windows-dev-action', 'run-1');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const revision = 'a'.repeat(40);
  const execute = vi.fn(async (_command, args, options) => {
    if (args.includes('rev-parse')) {
      return { code: 0, lines: [revision], output: `${revision}\n`, stderr: '', stdout: `${revision}\n` };
    }
    for (const name of WINDOWS_DEFAULT_SYNC_JOURNEY_SCREENSHOTS) {
      fs.writeFileSync(path.join(options.env.FOLIOLE_T160_EVIDENCE_ROOT, name), 'png');
    }
    return { code: 0, lines: ['passed'], output: 'passed\n', stderr: '', stdout: 'passed\n' };
  });
  const checked = async (executor, command, args, options) => executor(command, args, options);
  const result = await runWindowsDefaultSyncJourney({ checked, evidenceRoot, execute,
    paths: { gitPath: 'git.exe', repoRoot, systemNode: 'node.exe' } });

  expect(execute.mock.calls[0][1]).toEqual(['-C', repoRoot, 'rev-parse', 'HEAD']);
  expect(execute.mock.calls[1][1]).toContain(
    'tests/desktop/t160-windows-default-sync-journey.spec.ts'
  );
  expect(execute.mock.calls[1][1].at(-1)).not.toContain('\\');
  expect(execute.mock.calls[1][2]).toMatchObject({
    cwd: repoRoot,
    env: { FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: '1', FOLIOLE_T160_EVIDENCE_ROOT: evidenceRoot },
    timeoutMs: 30 * 60_000
  });
  expect(result).toMatchObject({ defaultSyncJourney: { sourceRevision: revision } });
  expect(JSON.parse(fs.readFileSync(result.defaultSyncJourney.manifestPath, 'utf8')))
    .toMatchObject({ resultStatus: 'success', sourceRevision: revision });
});

it('fails instead of accepting an incomplete screenshot set', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-default-sync-incomplete-'));
  roots.push(repoRoot);
  const evidenceRoot = path.join(repoRoot, 'evidence');
  fs.mkdirSync(evidenceRoot);
  const revision = 'b'.repeat(40);
  const execute = vi.fn(async (_command, args) => ({
    code: 0, lines: [], output: args.includes('rev-parse') ? `${revision}\n` : 'passed\n',
    stderr: '', stdout: args.includes('rev-parse') ? `${revision}\n` : 'passed\n'
  }));
  const checked = async (executor, command, args, options) => executor(command, args, options);
  await expect(runWindowsDefaultSyncJourney({ checked, evidenceRoot, execute,
    paths: { gitPath: 'git.exe', repoRoot, systemNode: 'node.exe' } }))
    .rejects.toThrow('did not produce t160-before-workspace.png');
});
