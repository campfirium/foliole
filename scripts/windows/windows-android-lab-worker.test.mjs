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
  paths.checkout = path.join(root, 'checkout');
  paths.workspaceDeployment = path.join(paths.checkout, '.foliole-android-lab-deployment.json');
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
  fs.mkdirSync(path.join(paths.checkout, '.git'), { recursive: true });
  writeJsonAtomic(paths.device, { endpoint: ENDPOINT, identity: 'A5-STABLE', schemaVersion: 1 });
  return paths;
}

function successfulExecutor(paths, calls) {
  return async (command, args, options) => {
    calls.push({ args, command, options });
    if (command === 'git.exe' && args.includes('pull')) return { code: 0, lines: ['Already up to date.'], output: 'Already up to date.\n' };
    if (command === 'git.exe' && args.includes('rev-parse')) return { code: 0, lines: [SHA], output: `${SHA}\n` };
    const adb = args[0] === '-P' ? args.slice(2) : args;
    if (command === 'adb.exe' && adb[0] === 'devices') {
      return { code: 0, lines: [`${ENDPOINT} device`], output: `List of devices attached\n${ENDPOINT}\tdevice\n` };
    }
    if (command === 'adb.exe' && args.includes('getprop')) return { code: 0, lines: ['A5-STABLE'], output: 'A5-STABLE\n' };
    if (command === 'adb.exe' && args.includes('logcat')) return { code: 0, lines: ['Foliole log'], output: 'Foliole log\n' };
    if (command === 'adb.exe') return { code: 0, lines: [], output: '' };
    if (args.includes('status')) return { code: 0, lines: [], output: '' };
    if (command === 'bash.exe') {
      expect(options.env.FOLIOLE_ANDROID_ADB_SERVER_PORT).toBe('5601');
      fs.mkdirSync(path.dirname(paths.workspaceDeployment), { recursive: true });
      return { code: 0, lines: ['[android-preview] status: OPENED'], output: '[android-preview] status: OPENED\n' };
    }
    if (command === 'powershell.exe') return { code: 1, lines: ['screenshot unavailable'], output: '' };
    return { code: 0, lines: [], output: '' };
  };
}

const noSync = async () => ({ commitSha: SHA });

describe('Windows Android lab worker', () => {
  it('executes a claimed general request in the worker and leaves a complete command audit', async () => {
    const paths = createFixture();
    fs.writeFileSync(path.join(paths.root, 'health.txt'), 'healthy\n');
    writeJsonAtomic(paths.active, {
      action: 'request', commitSha: SHA, cwd: { path: '', scope: 'lab' }, mode: 'automation',
      operation: { kind: 'read', path: 'health.txt' }, requestId: 'read-health',
      requestSha256: 'a'.repeat(64), runId: 'request-run', schemaVersion: 1,
      target: 'windows', timeoutMs: 30_000
    });
    await runWindowsAndroidLabWorker({
      executeCommand: async () => { throw new Error('bounded file read should not spawn'); },
      paths, platform: 'win32', syncRepository: noSync
    });
    expect(readJson(paths.status)).toMatchObject({ requestId: 'read-health', resultStatus: 'success', state: 'completed' });
    expect(readJson(path.join(paths.evidence, 'request-run', 'command-audit.json'))).toMatchObject({
      commands: [], operationKind: 'read', resultStatus: 'success'
    });
    expect(fs.readFileSync(path.join(paths.evidence, 'request-run', 'stdout.txt'), 'utf8')).toContain('healthy');
  });

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
      paths, platform: 'win32', runReviewPhase, syncRepository: noSync
    });
    expect(phases).toEqual(['review_audit']);
    expect(readJson(paths.status)).toMatchObject({ resultStatus: 'success', state: 'completed' });
    expect(fs.existsSync(paths.active)).toBe(false);
  });

  it('delegates a Review scenario request without entering the preview deploy path', async () => {
    const paths = createFixture();
    writeJsonAtomic(paths.active, {
      action: 'reviewScenario', commitSha: SHA, runId: '1000-dddddddddddd-scenario', schemaVersion: 1
    });
    const phases = [];
    const runReviewScenario = async ({ request, setPhase }) => {
      expect(request.action).toBe('reviewScenario');
      setPhase('scenario_capture');
      phases.push('scenario_capture');
    };
    await runWindowsAndroidLabWorker({
      executeCommand: async () => { throw new Error('deploy command should not run'); },
      paths, platform: 'win32', runReviewScenario, syncRepository: noSync
    });
    expect(phases).toEqual(['scenario_capture']);
    expect(readJson(paths.status)).toMatchObject({ resultStatus: 'success', state: 'completed' });
    expect(fs.existsSync(paths.active)).toBe(false);
  });

  it('pins the safety environment, hard timeout, and keeps the persistent checkout', async () => {
    const paths = createFixture();
    const calls = [];
    await runWindowsAndroidLabWorker({ executeCommand: successfulExecutor(paths, calls), paths, platform: 'win32' });
    const preview = calls.find((call) => call.command === 'bash.exe');
    expect(preview.options.timeoutMs).toBe(45 * 60_000);
    expect(preview.options.env).toMatchObject({
      ANDROID_DATA_PROTECTION: '1', ANDROID_PREVIEW_AVD: '', ANDROID_PREVIEW_OPEN_STUDIO: '0',
      ANDROID_USER_HOME: paths.signingHome,
      ANDROID_DATA_PROTECTION_RUNTIME_ROOT: paths.checkout, ANDROID_ELECTRON_ABI_PREPARE: '1',
      ANDROID_PREVIEW_SKIP_SOURCE_SYNC: '1',
      ANDROID_WINDOWS_DEPENDENCY_REFRESH: 'auto', FOLIOLE_ANDROID_SERIAL: ENDPOINT, JAVA_HOME: 'C:\\Java'
    });
    expect(preview.options.env.Path).toContain('C:\\Node;C:\\Java\\bin');
    const screenshot = calls.find((call) => call.command === 'powershell.exe' && call.args.includes('-OutputDir'));
    expect(screenshot.options.env).toMatchObject({
      FOLIOLE_ANDROID_ADB_PATH: 'adb.exe',
      FOLIOLE_ANDROID_SERIAL: ENDPOINT
    });
    expect(screenshot.options.env.Path).toContain('C:\\Node;C:\\Java\\bin');
    const gitCalls = calls.filter((call) => call.command === 'git.exe');
    expect(gitCalls.map((call) => call.args.filter((arg) => ['pull', 'rev-parse'].includes(arg)))).toEqual([
      ['pull'], ['rev-parse']
    ]);
    expect(fs.existsSync(paths.checkout)).toBe(true);
    expect(readJson(paths.status).resultStatus).toBe('success');
    expect(readJson(paths.deployment)).toMatchObject({ commitSha: SHA, deviceIdentity: 'A5-STABLE', runId: 'run-1' });
    expect(readJson(paths.workspaceDeployment)).toEqual(readJson(paths.deployment));
    expect(readJson(path.join(paths.evidence, 'run-1', 'summary.json')).previewStatus).toBe('opened');
    expect(readJson(path.join(paths.evidence, 'run-1', 'summary.json')).logcatStatus).toBe('captured');
    expect(fs.readFileSync(path.join(paths.evidence, 'run-1', 'logcat.txt'), 'utf8')).toContain('Foliole log');
    expect(fs.existsSync(paths.active)).toBe(false);
  });

  it('does not report install cache hit from the capacitor sync cache marker', async () => {
    const paths = createFixture();
    const calls = [];
    const executeCommand = async (command, args, options) => {
      const result = await successfulExecutor(paths, calls)(command, args, options);
      if (command === 'bash.exe') {
        return {
          code: 0,
          lines: ['[android-cap-sync] cache: HIT input=abc', '[android-deploy] install cache: MISS apk=abc'],
          output: '[android-cap-sync] cache: HIT input=abc\n[android-deploy] install cache: MISS apk=abc\n'
        };
      }
      return result;
    };
    await runWindowsAndroidLabWorker({ executeCommand, paths, platform: 'win32', syncRepository: noSync });
    expect(readJson(path.join(paths.evidence, 'run-1', 'summary.json')).installDisposition).toBe('installed');
  });

  it('fails before checkout when another ready device is present', async () => {
    const paths = createFixture();
    const executeCommand = async (_command, args) => {
      if (args.includes('getprop')) return { code: 0, lines: ['A5-STABLE'], output: 'A5-STABLE\n' };
      return { code: 0, lines: [], output: `${ENDPOINT}\tdevice\n192.168.0.108:40000\tdevice\n` };
    };
    await expect(runWindowsAndroidLabWorker({ executeCommand, paths, platform: 'win32', syncRepository: noSync })).rejects.toMatchObject({
      code: 'android_device_not_exclusive'
    });
    expect(readJson(paths.status).resultStatus).toBe('failure');
  });

  it('records a bounded preview timeout and preserves the persistent checkout', async () => {
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
    await expect(runWindowsAndroidLabWorker({ executeCommand, paths, platform: 'win32', syncRepository: noSync })).rejects.toMatchObject({
      code: 'android_preview_timeout'
    });
    expect(readJson(paths.status)).toMatchObject({ errorCode: 'android_preview_timeout', resultStatus: 'failure' });
    expect(fs.existsSync(paths.checkout)).toBe(true);
    expect(readJson(paths.deployment)).toEqual(previous);
    expect(readJson(paths.workspaceDeployment)).toEqual(previous);
  });

  it('fails before device access and checkout when the signing identity is missing', async () => {
    const paths = createFixture();
    fs.rmSync(paths.signingKeystore);
    const calls = [];
    await expect(runWindowsAndroidLabWorker({
      executeCommand: async (...args) => { calls.push(args); return { code: 0, lines: [], output: '' }; },
      paths, platform: 'win32', syncRepository: noSync
    })).rejects.toMatchObject({ code: 'android_signing_missing' });
    expect(calls).toEqual([]);
    expect(readJson(paths.status)).toMatchObject({ errorCode: 'android_signing_missing', resultStatus: 'failure' });
  });

  it('contains no destructive Android device command', () => {
    const source = fs.readFileSync('scripts/windows/windows-android-lab-worker.mjs', 'utf8');
    for (const forbidden of ['uninstall', 'pm clear', 'factory reset', 'shell pm']) expect(source).not.toContain(forbidden);
  });
});
