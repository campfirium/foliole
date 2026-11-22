// @vitest-environment node
/* global clearInterval, process, setInterval, setTimeout */
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { writeElectronDevClientState } from '../desktop/electron-dev-control-state.mjs';

import { resolveMacosElectronDevPaths } from './macos-electron-dev-paths.mjs';
import { runMacosElectronDevSupervisor } from './macos-electron-dev-supervisor.mjs';

const harness = vi.hoisted(() => ({ active: null, events: [], gateClasses: [], onSpawn: null, onStop: null }));
vi.mock('../lib/resource-gate.mjs', () => ({
  withResourceGate: async ({ className, fn }) => {
    harness.gateClasses.push(className);
    try { return await fn({}); }
    finally { harness.events.push('gate-released'); }
  }
}));
// Poll instead of fs.watch so readiness tests do not depend on host watcher limits.
vi.mock('../desktop/electron-dev-control-state.mjs', async (importOriginal) => ({
  ...await importOriginal(),
  waitForElectronDevCondition: ({ evaluate, label, signal, timeoutMs }) => new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      if (signal?.aborted) return finish(signal.reason);
      const value = evaluate();
      if (value) return finish(null, value);
      if (Date.now() >= deadline) finish(new Error(`${label} timed out`));
    }, 2);
    function finish(error, value) {
      clearInterval(timer);
      if (error) reject(error);
      else resolve(value);
    }
  })
}));
vi.mock('./macos-electron-dev-process.mjs', () => ({
  createMacosElectronDevLogger: async () => ({
    event() {}, close: async () => { harness.events.push('logger-closed'); }
  }),
  runLoggedCommand: vi.fn(),
  spawnLoggedChild: (_command, _args, options) => {
    void harness.onSpawn?.(options.env);
    return harness.active;
  },
  stopLoggedChild: async () => {
    await harness.onStop();
    harness.events.push('child-closed');
  }
}));
let root;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  harness.events = [];
  harness.gateClasses = [];
  harness.onSpawn = null;
});
async function setup(closed = new Promise(() => {}), { env = {}, pid = 42, verifyCdpPort } = {}) {
  root = await mkdtemp(path.join(os.tmpdir(), 'foliole-supervisor-'));
  const paths = resolveMacosElectronDevPaths(root);
  harness.active = { child: { pid }, closed };
  const run = () => runMacosElectronDevSupervisor({
    env, homeDir: root, verifyCdpPort, isAlive: () => false, libraryHome: path.join(root, 'library'),
    maintain() {}, paths, platform: 'darwin', prepareSignature: async () => {},
    startupTimeoutMs: verifyCdpPort ? 5000 : 20
  });
  return { paths, run };
}

it('retains ownership until timeout cleanup closes the child, then releases the gate', async () => {
  const { paths, run } = await setup();
  harness.onStop = async () => {
    expect(existsSync(paths.clientStateFile)).toBe(true);
  };
  await expect(run()).rejects.toThrow('timed out');
  expect(existsSync(paths.clientStateFile)).toBe(false);
  expect(harness.events).toEqual(['child-closed', 'logger-closed', 'gate-released']);
  // The resident daily debug session must not hold node-heavy for its whole lifetime.
  expect(harness.gateClasses).toEqual(['resident-preview']);
});

it('cancels readiness observation when the shell fails before becoming ready', async () => {
  const { paths, run } = await setup(Promise.resolve({ code: 1 }));
  harness.onStop = async () => {};
  await expect(run()).rejects.toThrow('inner dev shell exited before ready');
  expect(existsSync(paths.clientStateFile)).toBe(false);
  expect(harness.events).toEqual(['child-closed', 'logger-closed', 'gate-released']);
});

it('preserves the ownership record if the child cannot be stopped', async () => {
  const { paths, run } = await setup();
  harness.onStop = async () => { throw new Error('child still alive'); };
  await expect(run()).rejects.toThrow('child still alive');
  expect(existsSync(paths.clientStateFile)).toBe(true);
});

it('rejects a replacement while a recorded shell outlives its supervisor', async () => {
  const { paths } = await setup();
  await writeElectronDevClientState(paths, { supervisorPid: 41, shellPid: 42 });
  const prepareSignature = vi.fn();
  await expect(runMacosElectronDevSupervisor({
    paths, platform: 'darwin', isAlive: (pid) => pid === 42, prepareSignature
  })).rejects.toThrow('still owned');
  expect(prepareSignature).not.toHaveBeenCalled();
});

async function writeReadyMarkers(paths, session) {
  const marker = (stage, payload) => ({ pid: process.pid, session, stage, ...(payload ? { payload } : {}) });
  await mkdir(path.dirname(paths.appReadyFile), { recursive: true });
  await Promise.all([
    writeFile(paths.appReadyFile, JSON.stringify(marker('app_ready'))),
    writeFile(paths.bridgeReadyFile, JSON.stringify(marker('bridge_ready', { bridgeAvailable: true }))),
    writeFile(paths.windowVisibleFile, JSON.stringify(marker('window_visible', { isVisible: true })))
  ]);
}

function readyOnSpawn(paths) {
  harness.onSpawn = async (env) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeReadyMarkers(paths, env.FOLIOLE_BOOT_SESSION);
  };
}

it('fails startup when the requested CDP port belongs to another Electron', async () => {
  const verifyCdpPort = vi.fn(async () => {
    throw new Error('CDP port 9333 already in use by another process (browser pid=1111, runtime pid=4242)');
  });
  const { paths, run } = await setup(undefined, {
    env: { FOLIOLE_REMOTE_DEBUGGING_PORT: '9333' }, pid: process.pid, verifyCdpPort
  });
  readyOnSpawn(paths);
  harness.onStop = async () => {};
  await expect(run()).rejects.toThrow('CDP port 9333 already in use');
  expect(verifyCdpPort).toHaveBeenCalledWith({ port: 9333, runtimePid: process.pid });
  expect(existsSync(paths.clientStateFile)).toBe(false);
  expect(existsSync(paths.appReadyFile)).toBe(false);
  expect(harness.events).toEqual(['child-closed', 'logger-closed', 'gate-released']);
});

it('keeps the session once the CDP port is confirmed to belong to this runtime', async () => {
  let close;
  const closed = new Promise((resolve) => { close = resolve; });
  const verifyCdpPort = vi.fn(async ({ port, runtimePid }) => {
    close({ code: 0 });
    return { browserPid: runtimePid, port };
  });
  const { paths, run } = await setup(closed, {
    env: { FOLIOLE_REMOTE_DEBUGGING_PORT: '9333' }, pid: process.pid, verifyCdpPort
  });
  readyOnSpawn(paths);
  harness.onStop = async () => {};
  await expect(run()).resolves.toBe(0);
  expect(verifyCdpPort).toHaveBeenCalledWith({ port: 9333, runtimePid: process.pid });
});

it('skips the CDP ownership check when no remote debugging port was requested', async () => {
  let close;
  const closed = new Promise((resolve) => { close = resolve; });
  const verifyCdpPort = vi.fn();
  const { paths, run } = await setup(closed, { pid: process.pid, verifyCdpPort });
  harness.onSpawn = async (env) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeReadyMarkers(paths, env.FOLIOLE_BOOT_SESSION);
    setTimeout(() => close({ code: 0 }), 500);
  };
  harness.onStop = async () => {};
  await expect(run()).resolves.toBe(0);
  expect(verifyCdpPort).not.toHaveBeenCalled();
});
