// @vitest-environment node

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { androidLabPaths, readJson, writeJsonAtomic } from './windows-android-lab-state.mjs';
import { runWindowsAndroidLabWorker } from './windows-android-lab-worker.mjs';

const roots = [];
const SHA = 'd'.repeat(40);
const ENDPOINT = '192.168.0.107:38717';
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-worker-'));
  roots.push(root);
  const paths = androidLabPaths(root);
  paths.workspaceDeployment = path.join(root, 'preview', '.foliole-android-lab-deployment.json');
  writeJsonAtomic(paths.active, { commitSha: SHA, runId: 'run-1', schemaVersion: 1 });
  const signing = Buffer.from('private signing bytes');
  fs.mkdirSync(paths.signingHome, { recursive: true });
  fs.writeFileSync(paths.signingKeystore, signing);
  writeJsonAtomic(paths.config, {
    adbPath: 'adb.exe', bashPath: 'bash.exe', deviceIdentity: 'A5-STABLE', gitPath: 'git.exe',
    javaHome: 'C:\\Java', nodeDirectory: 'C:\\Node', androidDebugKeystoreSha256: createHash('sha256').update(signing).digest('hex'),
    schemaVersion: 2
  });
  fs.mkdirSync(paths.repository, { recursive: true });
  fs.writeFileSync(path.join(paths.repository, 'HEAD'), 'ref: refs/heads/lab/dev\n');
  writeJsonAtomic(paths.device, { endpoint: ENDPOINT, identity: 'A5-STABLE', schemaVersion: 1 });
  return paths;
}

function successfulExecutor(paths, calls) {
  return async (command, args, options) => {
    calls.push({ args, command, options });
    if (command === 'adb.exe' && args[0] === 'devices') {
      return { code: 0, lines: [`${ENDPOINT} device`], output: `List of devices attached\n${ENDPOINT}\tdevice\n` };
    }
    if (command === 'adb.exe' && args.includes('getprop')) return { code: 0, lines: ['A5-STABLE'], output: 'A5-STABLE\n' };
    if (command === 'adb.exe' && args.includes('logcat')) return { code: 0, lines: ['Foliole log'], output: 'Foliole log\n' };
    if (command === 'adb.exe') return { code: 0, lines: [], output: '' };
    if (args.includes('worktree') && args.includes('add')) fs.mkdirSync(paths.candidate, { recursive: true });
    if (args.includes('status')) return { code: 0, lines: [], output: '' };
    if (command === 'bash.exe') {
      fs.mkdirSync(path.dirname(paths.workspaceDeployment), { recursive: true });
      return { code: 0, lines: ['[android-preview] status: OPENED'], output: '[android-preview] status: OPENED\n' };
    }
    if (command === 'powershell.exe') return { code: 1, lines: ['screenshot unavailable'], output: '' };
    if (args.includes('remove')) fs.rmSync(paths.candidate, { force: true, recursive: true });
    return { code: 0, lines: [], output: '' };
  };
}

describe('Windows Android lab worker', () => {
  it('delegates a Review request without entering deploy or data-protection setup', async () => {
    const paths = createFixture();
    writeJsonAtomic(paths.active, {
      action: 'review', commitSha: SHA, reviewPhase: 'prepare',
      runId: '1000-dddddddddddd-prepare', schemaVersion: 1
    });
    const phases = [];
    const runReviewPhase = async ({ request, setPhase }) => {
      expect(request.reviewPhase).toBe('prepare');
      setPhase('review_audit');
      phases.push('review_audit');
    };
    await runWindowsAndroidLabWorker({
      executeCommand: async () => { throw new Error('deploy command should not run'); },
      paths, platform: 'win32', runReviewPhase
    });
    expect(phases).toEqual(['review_audit']);
    expect(readJson(paths.status)).toMatchObject({ resultStatus: 'success', state: 'completed' });
    expect(fs.existsSync(paths.active)).toBe(false);
  });

  it('pins the safety environment, hard timeout, and cleans the detached checkout', async () => {
    const paths = createFixture();
    const calls = [];
    await runWindowsAndroidLabWorker({ executeCommand: successfulExecutor(paths, calls), paths, platform: 'win32' });
    const preview = calls.find((call) => call.command === 'bash.exe');
    expect(preview.options.timeoutMs).toBe(45 * 60_000);
    expect(preview.options.env).toMatchObject({
      ANDROID_DATA_PROTECTION: '1', ANDROID_PREVIEW_AVD: '', ANDROID_PREVIEW_OPEN_STUDIO: '0',
      ANDROID_USER_HOME: paths.signingHome,
      ANDROID_DATA_PROTECTION_RUNTIME_ROOT: paths.preview, ANDROID_ELECTRON_ABI_PREPARE: '1',
      ANDROID_WINDOWS_DEPENDENCY_REFRESH: 'ci', FOLIOLE_ANDROID_SERIAL: ENDPOINT, JAVA_HOME: 'C:\\Java'
    });
    expect(preview.options.env.Path).toContain('C:\\Node;C:\\Java\\bin');
    expect(calls.some((call) => call.args.includes('fetch') || call.args.includes('clone'))).toBe(false);
    expect(calls.some((call) => call.args.includes('refs/heads/lab/dev'))).toBe(true);
    const gitCalls = calls.filter((call) => call.command === 'git.exe');
    expect(gitCalls.every((call) => (
      call.args[0] === '-c' && call.args[1] === `core.hooksPath=${path.join(paths.root, 'worker-empty-hooks')}`
    ))).toBe(true);
    expect(fs.existsSync(paths.candidate)).toBe(false);
    expect(readJson(paths.status).resultStatus).toBe('success');
    expect(readJson(paths.deployment)).toMatchObject({ commitSha: SHA, deviceIdentity: 'A5-STABLE', runId: 'run-1' });
    expect(readJson(paths.workspaceDeployment)).toEqual(readJson(paths.deployment));
    expect(readJson(path.join(paths.evidence, 'run-1', 'summary.json')).previewStatus).toBe('opened');
    expect(readJson(path.join(paths.evidence, 'run-1', 'summary.json')).logcatStatus).toBe('captured');
    expect(fs.readFileSync(path.join(paths.evidence, 'run-1', 'logcat.txt'), 'utf8')).toContain('Foliole log');
    expect(fs.existsSync(paths.active)).toBe(false);
  });

  it('fails before checkout when another ready device is present', async () => {
    const paths = createFixture();
    const executeCommand = async (_command, args) => {
      if (args.includes('getprop')) return { code: 0, lines: ['A5-STABLE'], output: 'A5-STABLE\n' };
      return { code: 0, lines: [], output: `${ENDPOINT}\tdevice\n192.168.0.108:40000\tdevice\n` };
    };
    await expect(runWindowsAndroidLabWorker({ executeCommand, paths, platform: 'win32' })).rejects.toMatchObject({
      code: 'android_device_not_exclusive'
    });
    expect(readJson(paths.status).resultStatus).toBe('failure');
  });

  it('records a bounded preview timeout and still removes its checkout', async () => {
    const paths = createFixture();
    const previous = { commitSha: 'c'.repeat(40), runId: 'previous' };
    fs.mkdirSync(path.dirname(paths.workspaceDeployment), { recursive: true });
    writeJsonAtomic(paths.deployment, previous);
    writeJsonAtomic(paths.workspaceDeployment, previous);
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
    expect(readJson(paths.deployment)).toEqual(previous);
    expect(readJson(paths.workspaceDeployment)).toEqual(previous);
  });

  it('fails before device access and checkout when the signing identity is missing', async () => {
    const paths = createFixture();
    fs.rmSync(paths.signingKeystore);
    const calls = [];
    await expect(runWindowsAndroidLabWorker({
      executeCommand: async (...args) => { calls.push(args); return { code: 0, lines: [], output: '' }; },
      paths, platform: 'win32'
    })).rejects.toMatchObject({ code: 'android_signing_missing' });
    expect(calls).toEqual([]);
    expect(readJson(paths.status)).toMatchObject({ errorCode: 'android_signing_missing', resultStatus: 'failure' });
  });

  it('contains no destructive Android device command', () => {
    const source = fs.readFileSync('scripts/windows/windows-android-lab-worker.mjs', 'utf8');
    for (const forbidden of ['uninstall', 'pm clear', 'factory reset', 'shell pm']) expect(source).not.toContain(forbidden);
  });
});
