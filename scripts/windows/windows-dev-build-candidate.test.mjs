// @vitest-environment node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { runWindowsDevBuild } from './windows-dev-build.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-candidate-build-'));
  roots.push(root);
  const repoRoot = path.join(root, 'repo');
  const signingHome = path.join(root, 'signing');
  const signingKeystore = path.join(signingHome, 'debug.keystore');
  const paths = {
    adbPath: path.join(root, 'missing-adb.exe'), androidSdk: path.join(root, 'sdk'),
    gitPath: path.join(root, 'git.exe'), javaHome: path.join(root, 'jbr'), repoRoot,
    signingHome, signingKeystore, signingManifest: path.join(signingHome, 'identity.json'),
    systemNode: path.join(root, 'node.exe'), systemNpmCli: path.join(root, 'npm-cli.js')
  };
  for (const directory of [repoRoot, signingHome, paths.androidSdk, paths.javaHome]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  for (const file of [paths.gitPath, paths.systemNode, paths.systemNpmCli]) fs.writeFileSync(file, 'tool');
  fs.writeFileSync(signingKeystore, 'keystore');
  fs.writeFileSync(paths.signingManifest, JSON.stringify({
    keystorePath: fs.realpathSync.native(signingKeystore), schemaVersion: 1,
    sha256: createHash('sha256').update('keystore').digest('hex')
  }));
  return paths;
}

function success(stdout = '') {
  return { code: 0, lines: [], output: `${stdout}\n`, stderr: '', stdout: `${stdout}\n` };
}

it('freezes the clean Windows candidate before host preparation mutates generated sources', async () => {
  const paths = fixture();
  const calls = [];
  const execute = vi.fn(async (command, args) => {
    calls.push({ args, command });
    return command === 'powershell.exe' ? success('[]') : success();
  });
  const order = [];
  const candidate = { branch: 'dev', clean: true, committed: true, mode: 'diagnostic',
    revision: 'a'.repeat(40), sourceRef: 'refs/heads/dev', treeDigest: 'b'.repeat(40) };
  const inspectCandidate = vi.fn(() => { order.push('freeze'); return candidate; });
  const prepareHost = vi.fn(async () => { order.push('prepare'); return 'prepared\n'; });
  const deviceAction = vi.fn(async () => ({
    multiDeviceSyncCandidate: { manifestPath: 'candidate.json' }, output: ''
  }));

  const run = await runWindowsDevBuild({ action: 'multi-device-sync-candidate', deviceAction,
    execute, inspectCandidate, paths, platform: 'win32', prepareHost });

  expect(run).toMatchObject({ exitCode: 0, summary: { action: 'multi-device-sync-candidate',
    multiDeviceSyncCandidate: { manifestPath: 'candidate.json' } } });
  expect(order).toEqual(['freeze', 'prepare']);
  expect(deviceAction).toHaveBeenCalledWith(expect.objectContaining({ candidate }));
  expect(calls.some(({ command }) => command === 'cmd.exe')).toBe(false);
  expect(calls.flatMap(({ args }) => args).join(' ')).not.toContain('adb');
});

it('rejects dirty Windows source before host preparation', async () => {
  const paths = fixture();
  const prepareHost = vi.fn();
  const run = await runWindowsDevBuild({ action: 'multi-device-sync-candidate',
    execute: vi.fn(async (command) => command === 'powershell.exe' ? success('[]') : success()),
    inspectCandidate: () => ({ clean: false }), paths, platform: 'win32', prepareHost });
  expect(run).toMatchObject({ exitCode: 64, summary: { failureStage: 'candidate' } });
  expect(prepareHost).not.toHaveBeenCalled();
});
