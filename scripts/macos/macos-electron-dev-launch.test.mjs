// @vitest-environment node

import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { writeElectronDevClientState } from '../desktop/electron-dev-control-state.mjs';
import {
  launchDetachedMacosElectronDev,
  resolveMacosElectronDevLauncherLogFile
} from './macos-electron-dev-launch.mjs';
import { resolveMacosElectronDevPaths } from './macos-electron-dev-paths.mjs';

const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function createPaths() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-dev-launch-'));
  roots.push(root);
  return resolveMacosElectronDevPaths(root);
}

async function writeReady(paths, session, pid) {
  const values = [
    [paths.appReadyFile, 'app_ready', {}],
    [paths.bridgeReadyFile, 'bridge_ready', { bridgeAvailable: true }],
    [paths.windowVisibleFile, 'window_visible', { isVisible: true }]
  ];
  await Promise.all(values.map(([filePath, stage, payload]) => writeFile(
    filePath,
    `${JSON.stringify({ payload, pid, session, stage })}\n`,
    'utf8'
  )));
}

function createFakeChild(pid) {
  const child = new EventEmitter();
  child.pid = pid;
  child.unref = vi.fn();
  return child;
}

describe('launchDetachedMacosElectronDev', () => {
  it('starts the supervisor in its own session and returns once that supervisor is ready', async () => {
    const paths = await createPaths();
    const child = createFakeChild(4242);
    const spawn = vi.fn(() => child);
    const waitForCondition = vi.fn(async ({ evaluate }) => {
      await writeElectronDevClientState(paths, { shellPid: 4243, supervisorPid: 4242 });
      await writeReady(paths, 'macos-daily-a', 4244);
      return evaluate();
    });

    const snapshot = await launchDetachedMacosElectronDev({
      argv: ['--library-home', '/tmp/lib'],
      env: { A: '1' },
      isAlive: () => true,
      paths,
      spawn,
      waitForCondition
    });

    expect(snapshot.ready.appReady.session).toBe('macos-daily-a');
    const [, args, options] = spawn.mock.calls[0];
    expect(args.slice(1)).toEqual(['start', '--library-home', '/tmp/lib']);
    expect(options).toMatchObject({ cwd: paths.appRoot, detached: true, env: { A: '1' } });
    expect(options.stdio[0]).toBe('ignore');
    expect(child.unref).toHaveBeenCalled();
    await expect(readFile(resolveMacosElectronDevLauncherLogFile(paths), 'utf8')).resolves.toBe('');
  });

  it('ignores a ready runtime that belongs to another supervisor', async () => {
    const paths = await createPaths();
    const child = createFakeChild(5000);
    const waitForCondition = vi.fn(async ({ evaluate }) => {
      await writeElectronDevClientState(paths, { shellPid: 9001, supervisorPid: 9000 });
      await writeReady(paths, 'macos-daily-old', 9002);
      return evaluate();
    });

    await expect(launchDetachedMacosElectronDev({
      isAlive: () => true,
      paths,
      spawn: () => child,
      waitForCondition
    })).resolves.toBeNull();
  });

  it('fails with the launch log when the supervisor exits before ready', async () => {
    const paths = await createPaths();
    const child = createFakeChild(6000);
    const waitForCondition = ({ signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      child.emit('exit', 1, null);
    });

    await expect(launchDetachedMacosElectronDev({
      isAlive: () => true,
      paths,
      spawn: () => child,
      waitForCondition
    })).rejects.toThrow(`exited before ready (code=1 signal=none); see ${resolveMacosElectronDevLauncherLogFile(paths)}`);
  });
});
