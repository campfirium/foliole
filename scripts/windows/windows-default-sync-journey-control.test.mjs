// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { runWindowsDefaultSyncJourneyControl } from './windows-default-sync-journey-control.mjs';
import { parseWindowsDevControlArgs, windowsDevSshSpec } from './windows-dev-control.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

it('registers one hyphenated fixed action through the existing PowerShell entry', () => {
  expect(parseWindowsDevControlArgs(['default-sync-journey'], {}))
    .toMatchObject({ action: 'default-sync-journey' });
  expect(windowsDevSshSpec('dev@windows', 'default-sync-journey', {}, '/Users/dev').at(-1))
    .toBe('default-sync-journey');
});

function fixture(remoteRevision = 'a'.repeat(40)) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-default-sync-control-'));
  roots.push(repoRoot);
  const identity = '20260830-run1';
  const remoteRoot = `D:/C/foliole/.tmp/artifacts/windows-dev-action/${identity}`;
  const executeGit = vi.fn(async (args) => args.includes('rev-parse') ? `${'a'.repeat(40)}\n` : 'pushed\n');
  const executeScp = vi.fn(async (args) => {
    const localPath = args.at(-1);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    const name = path.basename(localPath);
    if (name === 'default-sync-journey-receipt.json') {
      fs.writeFileSync(localPath, JSON.stringify({ resultStatus: 'success', sourceRevision: remoteRevision }));
    } else if (name === 'summary.json') {
      fs.writeFileSync(localPath, JSON.stringify({ resultStatus: 'success', sourceRevision: remoteRevision }));
    } else {
      fs.writeFileSync(localPath, name.endsWith('.png') ? 'png' : 'log');
    }
    return '';
  });
  const output = `[windows-dev-action] default-sync-journey identity=${identity} manifest=${remoteRoot}/default-sync-journey-receipt.json\n`;
  return { executeGit, executeScp, output, remoteRoot, repoRoot };
}

function options(current) {
  return {
    action: 'default-sync-journey',
    buildPushSpec: () => ({ args: ['push'], env: {} }),
    buildScpSpec: (_host, remote, local) => [remote, local],
    buildSshSpec: () => ['ssh'], env: {}, executeGit: current.executeGit,
    executeScp: current.executeScp, executeSsh: vi.fn(async () => current.output),
    fsApi: fs, host: 'dev@windows', repoRoot: current.repoRoot,
    sourceRef: 'refs/heads/dev', stdout: { write: vi.fn() }
  };
}

it('copies the bounded receipt, summary, log, and four screenshots after revision equality', async () => {
  const current = fixture();
  const result = await runWindowsDefaultSyncJourneyControl(options(current));
  expect(result).toMatchObject({ acceptedTip: 'a'.repeat(40), operation: 'complete' });
  expect(current.executeGit.mock.calls.map(([args]) => args[0])).toEqual(['rev-parse', 'push', 'rev-parse']);
  expect(current.executeScp).toHaveBeenCalledTimes(7);
  expect(fs.readdirSync(result.evidenceRoot).sort()).toEqual([
    'action.log', 'default-sync-journey-receipt.json', 'summary.json',
    't160-after-sync.png', 't160-after-workspace.png',
    't160-before-sync.png', 't160-before-workspace.png'
  ]);
});

it('rejects remote evidence from a different revision after preserving it locally', async () => {
  const current = fixture('b'.repeat(40));
  await expect(runWindowsDefaultSyncJourneyControl(options(current)))
    .rejects.toMatchObject({ evidenceRoot: expect.stringContaining('20260830-run1') });
});

it('does not enter Windows when Mac dev moves during the push', async () => {
  const current = fixture();
  current.executeGit
    .mockResolvedValueOnce(`${'a'.repeat(40)}\n`)
    .mockResolvedValueOnce('pushed\n')
    .mockResolvedValueOnce(`${'b'.repeat(40)}\n`);
  const runOptions = options(current);
  await expect(runWindowsDefaultSyncJourneyControl(runOptions))
    .rejects.toThrow('Mac dev moved');
  expect(runOptions.executeSsh).not.toHaveBeenCalled();
});

it('attempts the same bounded evidence set after a remote journey failure', async () => {
  const current = fixture();
  const runOptions = options(current);
  const remoteRoot = 'D:/C/foliole/.tmp/artifacts/windows-dev-action/20260830-failure';
  const remoteError = Object.assign(new Error('remote failed'), {
    output: `[windows-dev-action] status: FAILED exit=74 evidence=${remoteRoot}/summary.json\n`
  });
  runOptions.executeSsh.mockRejectedValue(remoteError);

  await expect(runWindowsDefaultSyncJourneyControl(runOptions))
    .rejects.toMatchObject({ evidenceRoot: expect.stringContaining('20260830-failure') });
  expect(current.executeScp).toHaveBeenCalledTimes(7);
  expect(current.executeScp.mock.calls.map(([args]) => path.basename(args.at(-1))).sort())
    .toEqual([
      'action.log', 'default-sync-journey-receipt.json', 'summary.json',
      't160-after-sync.png', 't160-after-workspace.png',
      't160-before-sync.png', 't160-before-workspace.png'
    ]);
});
