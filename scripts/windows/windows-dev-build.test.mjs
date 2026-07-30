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
    androidSdk: path.join(root, 'sdk'), gitPath: path.join(root, 'git.exe'),
    javaHome: path.join(root, 'jbr'), repoRoot, signingHome, signingKeystore,
    signingManifest, systemNode: path.join(root, 'node.exe'), systemNpm: path.join(root, 'npm.cmd')
  };
  for (const directory of [repoRoot, signingHome, paths.androidSdk, paths.javaHome]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  for (const file of [paths.gitPath, paths.systemNode, paths.systemNpm]) fs.writeFileSync(file, 'tool');
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
    if (args.includes('status')) return result(overrides.status ?? '');
    if (args.includes('pull') && overrides.pullFailure) {
      return { code: 1, lines: ['pull blocked'], output: '', stderr: 'pull blocked', stdout: '' };
    }
    if (args.includes('refs/remotes/lan/dev')) return result('b'.repeat(40));
    if (args.includes('HEAD')) return result(args.includes('pull') ? '' : overrides.head ?? 'b'.repeat(40));
    return result('');
  });
  return { calls, execute };
}

function result(stdout) {
  return { code: 0, lines: [], output: `${stdout}\n`, stderr: '', stdout: `${stdout}\n` };
}

describe('Windows DEV foreground build', () => {
  it('pulls only lan/dev and runs the fixed Gradle task with the signing home', async () => {
    const { paths } = fixture();
    const { calls, execute } = successfulExecutor(paths);
    const run = await runWindowsDevBuild({
      execute, id: () => '12345678-rest', now: () => new Date('2026-07-30T00:00:00Z'), paths,
      platform: 'win32'
    });
    expect(run.exitCode).toBe(0);
    expect(calls.find(({ args }) => args.includes('pull')).args)
      .toEqual(['-C', paths.repoRoot, 'pull', '--ff-only', 'lan', 'dev']);
    const build = calls.find(({ command }) => command === 'cmd.exe');
    expect(build.args).toEqual([
      '/d', '/s', '/c', 'call .\\gradlew.bat --no-daemon assembleDebugAndroidTest'
    ]);
    expect(build.options).toMatchObject({
      cwd: path.join(paths.repoRoot, 'android'), timeoutMs: 20 * 60_000
    });
    expect(build.options.env.ANDROID_USER_HOME).toBe(paths.signingHome);
    expect(run.summary).toMatchObject({ directChildPid: 77, head: 'b'.repeat(40), resultStatus: 'success' });
  });

  it('leaves HEAD and tracked changes unchanged when pull is blocked', async () => {
    const { paths } = fixture();
    const { calls, execute } = successfulExecutor(paths, {
      pullFailure: true, status: ' M android/file'
    });
    const run = await runWindowsDevBuild({ execute, paths, platform: 'win32' });
    expect(run).toMatchObject({ exitCode: 64, summary: { failureStage: 'pull' } });
    expect(calls.some(({ args }) => args.includes('pull'))).toBe(true);
    expect(calls.filter(({ args }) => args.includes('HEAD'))).toHaveLength(2);
    expect(calls.some(({ command }) => command === 'cmd.exe')).toBe(false);
  });

  it('fails closed when a repository-owned Java process already exists', async () => {
    const { paths } = fixture();
    const { calls, execute } = successfulExecutor(paths, { residual: '[{"ProcessId":42}]' });
    const run = await runWindowsDevBuild({ execute, paths, platform: 'win32' });
    expect(run).toMatchObject({ exitCode: 73, summary: { failureStage: 'residual' } });
    expect(calls.some(({ command }) => command === 'cmd.exe')).toBe(false);
  });
});

it('holds a FileShare.None lock and invokes only absolute system Node', () => {
  const source = fs.readFileSync('scripts/windows/windows-dev-build.ps1', 'utf8');
  expect(source).toContain('[System.IO.FileShare]::None');
  expect(source).toContain('C:\\Program Files\\nodejs\\node.exe');
  expect(source).toContain('exit 73');
  expect(source).toContain('windows-dev-build.mjs');
  expect(source).not.toContain('windows-android-lab\\runtime');
});
