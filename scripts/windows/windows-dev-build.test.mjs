// @vitest-environment node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runWindowsDevBuild } from './windows-dev-build.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-dev-build-'));
  roots.push(root);
  const repoRoot = path.join(root, 'repo');
  const signingHome = path.join(root, 'signing', 'android-user-home');
  const signingKeystore = path.join(signingHome, 'debug.keystore');
  const signingManifest = path.join(root, 'signing', 'identity.json');
  const paths = {
    adbPath: path.join(root, 'adb.exe'), androidSdk: path.join(root, 'sdk'), gitPath: path.join(root, 'git.exe'),
    javaHome: path.join(root, 'jbr'), repoRoot, signingHome, signingKeystore,
    signingManifest, systemNode: path.join(root, 'node.exe'), systemNpmCli: path.join(root, 'npm-cli.js')
  };
  for (const directory of [repoRoot, signingHome, paths.androidSdk, paths.javaHome]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  for (const file of [paths.adbPath, paths.gitPath, paths.systemNode, paths.systemNpmCli]) fs.writeFileSync(file, 'tool');
  fs.writeFileSync(signingKeystore, 'keystore');
  const digest = createHash('sha256').update('keystore').digest('hex');
  fs.writeFileSync(signingManifest, JSON.stringify({
    keystorePath: fs.realpathSync.native(signingKeystore), schemaVersion: 1, sha256: digest
  }));
  return { paths, repoRoot };
}

function successfulExecutor(paths, overrides = {}) {
  const calls = [];
  const execute = vi.fn(async (command, args, options) => {
    calls.push({ args, command, options });
    if (command === 'powershell.exe') return result(overrides.residual ?? '[]');
    if (command === 'cmd.exe') {
      options.onSpawn?.({ pid: 77 });
      return { code: 0, lines: ['BUILD SUCCESSFUL'], output: 'BUILD SUCCESSFUL\n', stderr: '', stdout: 'BUILD SUCCESSFUL\n' };
    }
    if (args.includes('--show-toplevel')) return result(paths.repoRoot);
    if (args.includes('--show-current')) return result('dev');
    if (args.includes('pull') && overrides.pullFailure) {
      return { code: 1, lines: ['pull blocked'], output: '', stderr: 'pull blocked', stdout: '' };
    }
    return result('');
  });
  return { calls, execute };
}

function result(stdout) {
  return { code: 0, lines: [], output: `${stdout}\n`, stderr: '', stdout: `${stdout}\n` };
}

describe('Windows DEV foreground build', () => {
  it('runs the fixed Gradle task with the signing home after the pull process exits', async () => {
    const { paths } = fixture();
    const { calls, execute } = successfulExecutor(paths);
    const run = await runWindowsDevBuild({
      execute, id: () => '12345678-rest', now: () => new Date('2026-07-30T00:00:00Z'), paths,
      platform: 'win32', prepareHost: vi.fn(async () => 'prepared\n')
    });
    expect(run.exitCode).toBe(0);
    const build = calls.find(({ command }) => command === 'cmd.exe');
    expect(build.args).toEqual([
      '/d', '/s', '/c', 'call .\\gradlew.bat --no-daemon assembleDebugAndroidTest'
    ]);
    expect(build.options).toMatchObject({
      cwd: path.join(paths.repoRoot, 'android'), timeoutMs: 20 * 60_000
    });
    expect(build.options.env.ANDROID_USER_HOME).toBe(paths.signingHome);
    expect(run.summary).toMatchObject({ action: 'build', directChildPid: 77, resultStatus: 'success' });
    expect(fs.readFileSync(run.summary.logPath, 'utf8')).toContain('prepared');
  });

  it('fails closed when a repository-owned Java process already exists', async () => {
    const { paths } = fixture();
    const { calls, execute } = successfulExecutor(paths, { residual: '[{"ProcessId":42}]' });
    const run = await runWindowsDevBuild({
      execute, paths, platform: 'win32', prepareHost: vi.fn()
    });
    expect(run).toMatchObject({ exitCode: 73, summary: { failureStage: 'residual' } });
    expect(calls.some(({ command }) => command === 'cmd.exe')).toBe(false);
  });

  it('keeps renderer-only live action out of build, sync, Gradle, and install', async () => {
    const { paths } = fixture();
    const { calls, execute } = successfulExecutor(paths);
    const prepareHost = vi.fn();
    const deviceAction = vi.fn(async ({ buildIdentity }) => ({
      liveReload: { buildIdentity, deviceLoads: 2, screenshotPath: 'a5-live.png' },
      output: 'live ok\n'
    }));
    const run = await runWindowsDevBuild({
      action: 'live', deviceAction, execute, paths, platform: 'win32', prepareHost
    });
    expect(run).toMatchObject({
      exitCode: 0,
      summary: { action: 'live', liveReload: { deviceLoads: 2 }, resultStatus: 'success' }
    });
    expect(prepareHost).not.toHaveBeenCalled();
    expect(calls.some(({ command }) => command === 'cmd.exe')).toBe(false);
    expect(calls.flatMap(({ args }) => args).join(' ')).not.toMatch(/gradle|install|android:web:build/iu);
  });

  it('prepares current companion assets before native deploy can install', async () => {
    const { paths } = fixture();
    const { execute } = successfulExecutor(paths);
    const order = [];
    const prepareHost = vi.fn(async () => { order.push('prepare'); return 'prepared\n'; });
    const deviceAction = vi.fn(async () => {
      order.push('deploy');
      return { liveReload: { buildIdentity: 'dev-3' }, output: 'deployed\n' };
    });
    const run = await runWindowsDevBuild({
      action: 'deploy', deviceAction, execute, paths, platform: 'win32', prepareHost
    });
    expect(run.exitCode).toBe(0);
    expect(order).toEqual(['prepare', 'deploy']);
    expect(fs.readFileSync(run.summary.logPath, 'utf8')).toBe('prepared\ndeployed\n');
  });
});

it('holds a FileShare.None lock and invokes only absolute system Node', () => {
  const source = fs.readFileSync('scripts/windows/windows-dev-build.ps1', 'utf8');
  const actionSource = fs.readFileSync('scripts/windows/windows-dev-action.ps1', 'utf8');
  expect(source).toContain('[System.IO.FileShare]::None');
  expect(source).toContain('C:\\Program Files\\nodejs\\node.exe');
  expect(source).toContain('[Console]::Error.WriteLine');
  expect(source).toContain('exit 73');
  expect(source).toContain('windows-dev-build.mjs');
  expect(source).not.toContain('Write-Error');
  expect(source).not.toContain('windows-android-lab\\runtime');
  expect(actionSource).toContain('[ValidateSet("build", "deploy", "live", "verify")]');
  expect(actionSource).toContain('[System.IO.FileShare]::None');
  expect(actionSource.indexOf('& $systemNode $puller')).toBeLessThan(actionSource.indexOf('& $systemNode $runner $Action'));
  expect(actionSource).toContain('& $systemNode $runner $Action');
});
