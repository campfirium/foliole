// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { androidLabPaths, readJson, writeJsonAtomic } from './windows-android-lab-state.mjs';
import { runWindowsAndroidLabWorker } from './windows-android-lab-worker.mjs';

const roots = [];
const SHA = 'd'.repeat(40);
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-worker-'));
  roots.push(root);
  const paths = androidLabPaths(root);
  writeJsonAtomic(paths.active, { commitSha: SHA, runId: 'run-1', schemaVersion: 1 });
  writeJsonAtomic(paths.config, {
    adbPath: 'adb.exe', bashPath: 'bash.exe', deviceSerial: 'A5', gitPath: 'git.exe', repositoryUrl: 'https://example.invalid/repo.git'
  });
  return paths;
}

function successfulExecutor(paths, calls) {
  return async (command, args, options) => {
    calls.push({ args, command, options });
    if (command === 'adb.exe') return { code: 0, lines: ['A5 device'], output: 'List of devices attached\nA5\tdevice\n' };
    if (args.includes('clone')) fs.mkdirSync(paths.repository, { recursive: true });
    if (args.includes('worktree') && args.includes('add')) fs.mkdirSync(paths.candidate, { recursive: true });
    if (args.includes('status')) return { code: 0, lines: [], output: '' };
    if (command === 'bash.exe') return { code: 0, lines: ['[android-preview] status: OPENED'], output: '[android-preview] status: OPENED\n' };
    if (command === 'powershell.exe') return { code: 1, lines: ['screenshot unavailable'], output: '' };
    if (args.includes('remove')) fs.rmSync(paths.candidate, { force: true, recursive: true });
    return { code: 0, lines: [], output: '' };
  };
}

describe('Windows Android lab worker', () => {
  it('pins the safety environment, hard timeout, and cleans the detached checkout', async () => {
    const paths = createFixture();
    const calls = [];
    await runWindowsAndroidLabWorker({ executeCommand: successfulExecutor(paths, calls), paths, platform: 'win32' });
    const preview = calls.find((call) => call.command === 'bash.exe');
    expect(preview.options.timeoutMs).toBe(45 * 60_000);
    expect(preview.options.env).toMatchObject({
      ANDROID_DATA_PROTECTION: '1', ANDROID_PREVIEW_AVD: '', ANDROID_PREVIEW_OPEN_STUDIO: '0',
      ANDROID_WINDOWS_DEPENDENCY_REFRESH: 'ci', FOLIOLE_ANDROID_SERIAL: 'A5'
    });
    expect(fs.existsSync(paths.candidate)).toBe(false);
    expect(readJson(paths.status).resultStatus).toBe('success');
    expect(readJson(path.join(paths.evidence, 'run-1', 'summary.json')).previewStatus).toBe('opened');
  });

  it('fails before checkout when another ready device is present', async () => {
    const paths = createFixture();
    const executeCommand = async () => ({ code: 0, lines: [], output: 'A5\tdevice\nB6\tdevice\n' });
    await expect(runWindowsAndroidLabWorker({ executeCommand, paths, platform: 'win32' })).rejects.toMatchObject({
      code: 'android_device_not_exclusive'
    });
    expect(readJson(paths.status).resultStatus).toBe('failure');
  });

  it('records a bounded preview timeout and still removes its checkout', async () => {
    const paths = createFixture();
    const calls = [];
    const base = successfulExecutor(paths, calls);
    const executeCommand = async (command, args, options) => {
      if (command === 'bash.exe') throw Object.assign(new Error('preview exceeded limit'), { code: 'android_preview_timeout' });
      return base(command, args, options);
    };
    await expect(runWindowsAndroidLabWorker({ executeCommand, paths, platform: 'win32' })).rejects.toMatchObject({
      code: 'android_preview_timeout'
    });
    expect(readJson(paths.status)).toMatchObject({ errorCode: 'android_preview_timeout', resultStatus: 'failure' });
    expect(fs.existsSync(paths.candidate)).toBe(false);
  });

  it('contains no destructive Android device command', () => {
    const source = fs.readFileSync('scripts/windows/windows-android-lab-worker.mjs', 'utf8');
    for (const forbidden of ['uninstall', 'pm clear', 'factory reset', 'shell pm']) expect(source).not.toContain(forbidden);
  });
});
