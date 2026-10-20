// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';

import {
  runWindowsDevControl, WINDOWS_DEV_ACTIONS, WINDOWS_DEV_DEFAULT_SSH
} from './windows-dev-control.mjs';
import { createWindowsDevRemoteSpecTestFixture } from './windows-dev-remote-spec-test-fixture.mjs';
import {
  assertPushedPreflightTarget, parseWindowsRemotePreflightArgs, parseWindowsRemotePreflightEvidence
} from './windows-remote-preflight-control.mjs';

const transport = createWindowsDevRemoteSpecTestFixture();
const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-preflight-control-'));
afterAll(() => {
  transport.cleanup();
  fs.rmSync(repoRoot, { force: true, recursive: true });
});

const BASE = 'b'.repeat(40);
const TARGET = 'c'.repeat(40);
const ROOT = 'D:/C/foliole/.tmp/artifacts/windows-dev-action/run-1/remote-preflight';
const LINE = `[windows-dev-action] remote-preflight identity=run-1 receipt=${ROOT}/receipt.json\n`;

it('registers remote-preflight as a fixed Windows action', () => {
  expect(WINDOWS_DEV_ACTIONS).toContain('remote-preflight');
  expect(parseWindowsRemotePreflightArgs(['remote-preflight', '--revision', TARGET,
    '--preflight-base', BASE], {})).toMatchObject({ base: BASE, target: TARGET });
  expect(() => parseWindowsRemotePreflightArgs(['remote-preflight', '--revision', TARGET], {}))
    .toThrow('requires --revision');
});

it('accepts only receipts under the fixed evidence root', () => {
  expect(parseWindowsRemotePreflightEvidence(LINE.replaceAll('/', '\\')))
    .toEqual({ identity: 'run-1', receiptPath: `${ROOT}/receipt.json` });
  expect(() => parseWindowsRemotePreflightEvidence(
    '[windows-dev-action] remote-preflight identity=run-1 receipt=C:/x/receipt.json'
  )).toThrow('escaped');
});

it('refuses a target that is not on pushed origin/dev', () => {
  const run = vi.fn((command, args) => ({ status: args[0] === 'merge-base' ? 1 : 0 }));
  expect(() => assertPushedPreflightTarget('/repo', TARGET, run)).toThrow('not on pushed origin/dev');
  expect(run).toHaveBeenCalledWith('git', ['merge-base', '--is-ancestor', TARGET,
    'refs/remotes/origin/dev'], { cwd: '/repo' });
});

function control(executeSsh, verifyPushed = () => TARGET) {
  const calls = [];
  const prepareInternalRuntime = vi.fn(async ({ revision }) => { calls.push(['runtime', revision]); });
  const executeScp = vi.fn(async (args) => {
    const local = args.at(-1);
    fs.writeFileSync(local, local.endsWith('receipt.json')
      ? JSON.stringify({ runId: 'run-1', target: { revision: TARGET } }) : 'log');
  });
  const promise = runWindowsDevControl({
    argv: ['remote-preflight', '--revision', TARGET, '--preflight-base', BASE],
    env: transport.env, executeGit: async (args) => { calls.push(args); },
    executeScp, executeSsh, fsApi: transport.fsApi, prepareInternalRuntime, repoRoot,
    stdout: { write: vi.fn() }, verifyPushed
  });
  return { calls, executeScp, promise };
}

it('mirrors the exact pushed target, passes the base and copies the receipt', async () => {
  const executeSsh = vi.fn(async () => LINE);
  const { calls, executeScp, promise } = control(executeSsh);
  const result = await promise;
  expect(calls[0]).toEqual(['runtime', TARGET]);
  expect(calls[1]).toContain(`+${TARGET}:refs/heads/dev`);
  expect(executeSsh.mock.calls[0][0].slice(-3)).toEqual(['remote-preflight', '-PreflightBase', BASE]);
  expect(executeScp.mock.calls.map(([args]) => args.at(-2)))
    .toEqual([`${WINDOWS_DEV_DEFAULT_SSH}:${ROOT}/receipt.json`, `${WINDOWS_DEV_DEFAULT_SSH}:${ROOT}/action.log`]);
  expect(result.receipt.target.revision).toBe(TARGET);
  expect(result.evidenceRoot).toBe(path.join(repoRoot, '.tmp', 'artifacts', 'remote-preflight',
    TARGET, 'windows', 'run-1'));
});

it('keeps the receipt of a failed Windows run', async () => {
  const failed = control(vi.fn(async () => { throw Object.assign(new Error('exit 1'), { output: LINE }); }));
  await expect(failed.promise).resolves.toMatchObject({ receipt: { runId: 'run-1' } });
});

it('aligns an outdated wrapper with a bare call before retrying with the base', async () => {
  const outdated = "A parameter cannot be found that matches parameter name 'PreflightBase'.";
  const executeSsh = vi.fn()
    .mockRejectedValueOnce(Object.assign(new Error('bad'), { output: outdated }))
    .mockRejectedValueOnce(new Error('Unknown Windows DEV action'))
    .mockResolvedValueOnce(LINE);
  await expect(control(executeSsh).promise).resolves.toMatchObject({ receipt: { runId: 'run-1' } });
  expect(executeSsh.mock.calls.map(([args]) => args.at(-1))).toEqual([BASE, 'remote-preflight', BASE]);
});

it('does not push or contact Windows when the target is unpushed', async () => {
  const executeSsh = vi.fn();
  const { calls, promise } = control(executeSsh, () => { throw new Error('push dev first'); });
  await expect(promise).rejects.toThrow('push dev first');
  expect(calls).toEqual([]);
  expect(executeSsh).not.toHaveBeenCalled();
});

it('routes the Windows wrapper to the preflight runner after aligning the mirror', () => {
  const source = fs.readFileSync('scripts/windows/windows-dev-action.ps1', 'utf8');
  const run = '& $systemNode $remotePreflightRunner $PreflightBase';
  expect(source).toContain('[ValidatePattern("^[0-9a-f]{40}$")]');
  expect(source).toContain('$Action -eq "remote-preflight"');
  expect(source.indexOf('& $systemNode $puller')).toBeLessThan(source.indexOf(run));
});
