// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { isAndroidImeVisible, runWindowsA5LiveReload } from './windows-a5-live-reload-action.mjs';
import { WINDOWS_A5_LIVE_RELOAD_PORT } from './windows-a5-live-reload-server.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a5-live-action-'));
  roots.push(root);
  return { evidenceRoot: path.join(root, 'evidence'), paths: { adbPath: 'adb.exe', repoRoot: root } };
}

function success(stdout = '') {
  return { code: 0, lines: [], output: stdout, stderr: '', stdout };
}

function createExecutor(evidenceRoot) {
  const calls = [];
  const execute = vi.fn(async (command, args) => {
    calls.push({ args, command });
    if (args.includes('path')) return success('package:/data/app/base.apk\n');
    if (args.includes('input_method')) return success('mInputShown=true\n');
    if (args.includes('pull')) {
      fs.mkdirSync(evidenceRoot, { recursive: true });
      fs.writeFileSync(args.at(-1), 'png');
    }
    return success('ok\n');
  });
  return { calls, execute };
}

function createServer(overrides = {}) {
  let sequence = 0;
  return {
    close: vi.fn(async () => {}), url: 'http://127.0.0.1:24605',
    waitForDeviceInput: vi.fn(async () => ({ x: 120, y: 240 })),
    waitForDeviceLoad: vi.fn(async () => ({ sequence: sequence += 1 })), ...overrides
  };
}

it('loads the installed shell once without Gradle or APK install', async () => {
  const { evidenceRoot, paths } = fixture();
  const { calls, execute } = createExecutor(evidenceRoot);
  const server = createServer();
  const startServer = vi.fn(async () => server);
  const verifyForeground = vi.fn(async () => {});
  const run = await runWindowsA5LiveReload({
    adbPort: '5037', buildIdentity: 'dev-1', env: {}, evidenceRoot, execute, paths,
    serial: '87a33a4b', startServer, surface: 'appearance', verifyForeground
  });
  expect(run.liveReload).toMatchObject({ buildIdentity: 'dev-1', deviceLoads: 1 });
  expect(startServer).toHaveBeenCalledWith(expect.objectContaining({ surface: 'appearance' }));
  expect(calls.map(({ args }) => args)).toContainEqual([
    '-P', '5037', '-s', '87a33a4b', 'reverse',
    `tcp:${WINDOWS_A5_LIVE_RELOAD_PORT}`, `tcp:${WINDOWS_A5_LIVE_RELOAD_PORT}`
  ]);
  expect(calls.filter(({ args }) => args.includes('force-stop'))).toHaveLength(1);
  expect(calls.filter(({ args }) => args.includes('start'))).toHaveLength(1);
  expect(verifyForeground).toHaveBeenCalledOnce();
  expect(calls.flatMap(({ args }) => args)).not.toContain('install');
  expect(calls.flatMap(({ args }) => args).join(' ')).not.toMatch(/gradle/iu);
  expect(calls.at(-1).args).toEqual([
    '-P', '5037', '-s', '87a33a4b', 'reverse', '--remove', `tcp:${WINDOWS_A5_LIVE_RELOAD_PORT}`
  ]);
  expect(server.close).toHaveBeenCalledOnce();
});

it('runs the bounded secondary acceptance and stores its receipt', async () => {
  const { evidenceRoot, paths } = fixture();
  const { calls, execute: baseExecute } = createExecutor(evidenceRoot);
  const acceptance = { identity: 'dev-secondary', receipts: [{ step: 'search' }], status: 'passed' };
  let resolveLoad;
  const server = createServer({
    waitForDeviceLoad: vi.fn(() => new Promise((resolve) => { resolveLoad = resolve; }))
  });
  const execute = vi.fn(async (command, args, options) => {
    const result = await baseExecute(command, args, options);
    if (args.includes('tap')) resolveLoad({ acceptance, sequence: 1 });
    return result;
  });
  const run = await runWindowsA5LiveReload({
    adbPort: '5037', buildIdentity: 'dev-secondary', env: {}, evidenceRoot, execute, paths,
    serial: '87a33a4b', startServer: vi.fn(async () => server), surface: 'secondary',
    verifyForeground: vi.fn(async () => {})
  });
  expect(calls.map(({ args }) => args)).toContainEqual([
    '-P', '5037', '-s', '87a33a4b', 'shell', 'input', 'tap', '120', '240'
  ]);
  expect(calls.map(({ args }) => args)).toContainEqual([
    '-P', '5037', '-s', '87a33a4b', 'shell', 'dumpsys', 'input_method'
  ]);
  expect(JSON.parse(fs.readFileSync(run.liveReload.acceptancePath, 'utf8'))).toEqual(acceptance);
});

it('recognizes visible Android IME state without accepting hidden state', () => {
  expect(isAndroidImeVisible('mInputShown=true')).toBe(true);
  expect(isAndroidImeVisible('mIsInputViewShown=true')).toBe(true);
  expect(isAndroidImeVisible('mImeWindowVis=0x3')).toBe(true);
  expect(isAndroidImeVisible('mInputShown=false mImeWindowVis=0x0')).toBe(false);
});

it('captures a secondary scenario failure that occurs before the input checkpoint', async () => {
  const { evidenceRoot, paths } = fixture();
  const { calls, execute } = createExecutor(evidenceRoot);
  const failure = Object.assign(new Error('cannot exit current surface'), {
    exitCode: 74, stage: 'live-load'
  });
  const server = createServer({
    waitForDeviceInput: vi.fn(() => new Promise(() => {})),
    waitForDeviceLoad: vi.fn(async () => { throw failure; })
  });
  await expect(runWindowsA5LiveReload({
    adbPort: '5037', buildIdentity: 'dev-secondary-failure', env: {}, evidenceRoot, execute, paths,
    serial: '87a33a4b', startServer: vi.fn(async () => server), surface: 'secondary',
    verifyForeground: vi.fn(async () => {})
  })).rejects.toMatchObject({
    stage: 'live-load',
    liveReload: { screenshotPath: path.join(evidenceRoot, 'a5-live.png') }
  });
  expect(calls.some(({ args }) => args.includes('--remove'))).toBe(true);
  expect(server.close).toHaveBeenCalledOnce();
});

it('removes reverse and closes the server after a device load failure', async () => {
  const { evidenceRoot, paths } = fixture();
  const { calls, execute } = createExecutor(evidenceRoot);
  const failure = Object.assign(new Error('load timeout'), { exitCode: 74, stage: 'live-load' });
  const server = createServer({ waitForDeviceLoad: vi.fn(async () => { throw failure; }) });
  let received;
  try {
    await runWindowsA5LiveReload({
      adbPort: '5037', buildIdentity: 'dev-2', env: {}, evidenceRoot, execute, paths,
      serial: '87a33a4b', startServer: vi.fn(async () => server), verifyForeground: vi.fn()
    });
  } catch (error) { received = error; }
  expect(received).toMatchObject({
    stage: 'live-load',
    liveReload: { buildIdentity: 'dev-2', screenshotPath: path.join(evidenceRoot, 'a5-live.png') }
  });
  expect(calls.some(({ args }) => args.includes('--remove'))).toBe(true);
  expect(server.close).toHaveBeenCalledOnce();
});
