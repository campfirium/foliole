// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { runWindowsA5LiveReload } from './windows-a5-live-reload-action.mjs';
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
    waitForDeviceLoad: vi.fn(async () => ({ sequence: sequence += 1 })), ...overrides
  };
}

it('loads and reloads the installed shell without Gradle or APK install', async () => {
  const { evidenceRoot, paths } = fixture();
  const { calls, execute } = createExecutor(evidenceRoot);
  const server = createServer();
  const verifyForeground = vi.fn(async () => {});
  const run = await runWindowsA5LiveReload({
    adbPort: '5037', buildIdentity: 'dev-1', env: {}, evidenceRoot, execute, paths,
    serial: '87a33a4b', startServer: vi.fn(async () => server), verifyForeground
  });
  expect(run.liveReload).toMatchObject({ buildIdentity: 'dev-1', deviceLoads: 2 });
  expect(calls.map(({ args }) => args)).toContainEqual([
    '-P', '5037', '-s', '87a33a4b', 'reverse',
    `tcp:${WINDOWS_A5_LIVE_RELOAD_PORT}`, `tcp:${WINDOWS_A5_LIVE_RELOAD_PORT}`
  ]);
  expect(calls.filter(({ args }) => args.includes('force-stop'))).toHaveLength(2);
  expect(calls.filter(({ args }) => args.includes('start'))).toHaveLength(2);
  expect(verifyForeground).toHaveBeenCalledOnce();
  expect(calls.flatMap(({ args }) => args)).not.toContain('install');
  expect(calls.flatMap(({ args }) => args).join(' ')).not.toMatch(/gradle/iu);
  expect(calls.at(-1).args).toEqual([
    '-P', '5037', '-s', '87a33a4b', 'reverse', '--remove', `tcp:${WINDOWS_A5_LIVE_RELOAD_PORT}`
  ]);
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
