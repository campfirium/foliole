// @vitest-environment node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

import { toWindowsDevWireAction } from './windows-dev-action-contract.mjs';
import { parseWindowsDevControlArgs } from './windows-dev-control.mjs';
import { runWindowsDevBuild } from './windows-dev-build.mjs';
import { parseWindowsDevSuccessEvidence } from './windows-dev-control-evidence.mjs';
import { runWindowsDeviceProfileAcceptance } from './windows-device-profile-action.mjs';
import { copyWindowsDeviceProfileEvidence } from './windows-device-profile-control.mjs';

it('routes one fixed Windows desktop profile action through the old wrapper', () => {
  expect(parseWindowsDevControlArgs(['device-profile'], {})).toMatchObject({ action: 'device-profile' });
  expect(toWindowsDevWireAction('device-profile')).toBe('deviceprofile');
  const build = fs.readFileSync('scripts/windows/windows-dev-build.mjs', 'utf8');
  expect(build).toContain("runWindowsDeviceProfileAcceptance(action, execute, paths)");
  expect(build).toContain("action === 'device-profile'");
  expect(build).toContain("['build', 'device-profile']");
});

it('runs only the targeted hidden native profile spec', async () => {
  const execute = vi.fn(async () => ({ code: 0, output: 'passed\n' }));
  const paths = { repoRoot: 'C:\\repo', systemNode: 'node.exe', systemNpmCli: 'npm-cli.js' };
  await expect(runWindowsDeviceProfileAcceptance('device-profile', execute, paths)).resolves.toEqual({
    evidence: { resultStatus: 'passed', spec: 'tests/desktop/host-owned-device-profile.spec.ts' },
    output: 'passed\n'
  });
  expect(execute).toHaveBeenCalledWith('node.exe', [
    'npm-cli.js', 'run', 'test:e2e:desktop:native:hidden', '--',
    'tests/desktop/host-owned-device-profile.spec.ts'
  ], expect.objectContaining({
    cwd: 'C:\\repo',
    env: expect.objectContaining({ FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: '1' }),
    windowsHide: true
  }));
});

it('builds the desktop before the bounded device profile acceptance', async () => {
  fs.mkdirSync(path.resolve('.tmp/artifacts'), { recursive: true });
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/windows-device-profile-build-'));
  const paths = profileBuildPaths(root);
  const calls = [];
  const execute = vi.fn(async (command, args) => {
    calls.push({ args, command });
    if (command === 'powershell.exe') return commandResult('[]');
    return commandResult('');
  });
  try {
    const run = await runWindowsDevBuild({ action: 'device-profile', execute, paths, platform: 'win32' });
    expect(calls.filter(({ command }) => command === paths.systemNode).map(({ args }) => args.slice(1)))
      .toEqual([['run', 'build'], ['run', 'electron:compile'], [
        'run', 'test:e2e:desktop:native:hidden', '--', 'tests/desktop/host-owned-device-profile.spec.ts'
      ]]);
    expect(run.exitCode).toBe(0);
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

function commandResult(stdout) {
  return { code: 0, lines: [], output: `${stdout}\n`, stderr: '', stdout: `${stdout}\n` };
}

function profileBuildPaths(root) {
  const repoRoot = path.join(root, 'repo');
  const signingHome = path.join(root, 'signing');
  const signingKeystore = path.join(signingHome, 'debug.keystore');
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.mkdirSync(signingHome, { recursive: true });
  fs.writeFileSync(signingKeystore, 'keystore');
  const sha256 = createHash('sha256').update('keystore').digest('hex');
  const signingManifest = path.join(signingHome, 'identity.json');
  fs.writeFileSync(signingManifest, JSON.stringify({ keystorePath: fs.realpathSync.native(signingKeystore), schemaVersion: 1, sha256 }));
  const tool = path.join(root, 'tool.exe'); fs.writeFileSync(tool, 'tool');
  return { adbPath: tool, androidSdk: root, gitPath: tool, javaHome: root, repoRoot,
    signingHome, signingKeystore, signingManifest, systemNode: tool, systemNpmCli: tool };
}

it('accepts only the fixed Windows action evidence root', () => {
  const remoteRoot = 'C:/dev/foliole-android-lab-preview/.tmp/artifacts/windows-dev-action/run-1';
  expect(parseWindowsDevSuccessEvidence(
    `[windows-dev-action] status: OK exit=0 evidence=${remoteRoot}/summary.json\n`
  )).toEqual({ buildIdentity: 'run-1', remoteRoot });
  expect(() => parseWindowsDevSuccessEvidence(
    '[windows-dev-action] status: OK exit=0 evidence=C:/Users/dev/private.json\n'
  )).toThrow('escaped its fixed root');
});

it('copies only the bounded profile action log and summary', async () => {
  fs.mkdirSync(path.resolve('.tmp/artifacts'), { recursive: true });
  const repoRoot = fs.mkdtempSync(path.resolve('.tmp/artifacts/windows-device-profile-control-'));
  const remoteRoot = 'C:/dev/foliole-android-lab-preview/.tmp/artifacts/windows-dev-action/run-2';
  const copyFile = vi.fn(async (_remote, local) => fs.writeFileSync(local, 'evidence'));
  try {
    const result = await copyWindowsDeviceProfileEvidence({
      action: 'device-profile', copyFile, fsApi: fs, remoteError: null,
      remoteOutput: `[windows-dev-action] status: OK exit=0 evidence=${remoteRoot}/summary.json\n`,
      repoRoot
    });
    expect(copyFile).toHaveBeenCalledTimes(2);
    expect(result.manifestPath).toBe(path.join(result.evidenceRoot, 'summary.json'));
  } finally {
    fs.rmSync(repoRoot, { force: true, recursive: true });
  }
});
