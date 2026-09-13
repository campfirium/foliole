// @vitest-environment node
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { writeElectronDevClientState } from '../desktop/electron-dev-control-state.mjs';

import { resolveMacosElectronDevPaths } from './macos-electron-dev-paths.mjs';
import { runMacosElectronDevSupervisor } from './macos-electron-dev-supervisor.mjs';

const harness = vi.hoisted(() => ({ active: null, events: [], onStop: null }));
vi.mock('../lib/resource-gate.mjs', () => ({
  withResourceGate: async ({ fn }) => {
    try { return await fn({}); }
    finally { harness.events.push('gate-released'); }
  }
}));
vi.mock('./macos-electron-dev-process.mjs', () => ({
  createMacosElectronDevLogger: async () => ({
    event() {}, close: async () => { harness.events.push('logger-closed'); }
  }),
  runLoggedCommand: vi.fn(),
  spawnLoggedChild: () => harness.active,
  stopLoggedChild: async () => {
    await harness.onStop();
    harness.events.push('child-closed');
  }
}));
let root;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  harness.events = [];
});
async function setup(closed = new Promise(() => {})) {
  root = await mkdtemp(path.join(os.tmpdir(), 'foliole-supervisor-'));
  const paths = resolveMacosElectronDevPaths(root);
  harness.active = { child: { pid: 42 }, closed };
  const run = () => runMacosElectronDevSupervisor({
    env: {}, homeDir: root, isAlive: () => false, libraryHome: path.join(root, 'library'),
    maintain() {}, paths, platform: 'darwin', prepareSignature: async () => {},
    startupTimeoutMs: 20
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
