// @vitest-environment node
/* global process */

import { EventEmitter } from 'node:events';

import { afterEach, expect, it, vi } from 'vitest';

import { createElectronDevChildLifecycle } from './electron-dev-child-lifecycle.mjs';

function createChild() {
  const child = new EventEmitter();
  child.exitCode = null;
  child.killed = false;
  child.signalCode = null;
  child.kill = vi.fn(() => {
    child.killed = true;
    return true;
  });
  return child;
}

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

it('waits for owned children after a cooperative shell shutdown', () => {
  const electron = createChild();
  const vite = createChild();
  const lifecycle = createElectronDevChildLifecycle({
    consumeRestartRequest: vi.fn(),
    electron,
    launchElectron: vi.fn(),
    logChildLifecycle: vi.fn(),
    vite
  });

  lifecycle.shutdown();

  expect(electron.kill).toHaveBeenCalledWith('SIGTERM');
  expect(vite.kill).toHaveBeenCalledWith('SIGTERM');
  expect(process.exitCode).toBe(0);
});

it('relaunches Electron only for a valid runtime restart request', () => {
  const electron = createChild();
  const replacement = createChild();
  const launchElectron = vi.fn(() => replacement);
  const logChildLifecycle = vi.fn();
  createElectronDevChildLifecycle({
    consumeRestartRequest: () => ({ reason: 'compile inputs changed' }),
    electron,
    launchElectron,
    logChildLifecycle,
    vite: null
  }).restartRuntime();

  expect(electron.kill).toHaveBeenCalledWith('SIGTERM');
  electron.emit('exit', 0);

  expect(launchElectron).toHaveBeenCalledOnce();
  expect(logChildLifecycle).toHaveBeenCalledWith(replacement, 'electron');
  expect(process.exitCode).toBeUndefined();
});

it('does not relaunch Electron while the shell is shutting down', () => {
  const electron = createChild();
  const launchElectron = vi.fn();
  const lifecycle = createElectronDevChildLifecycle({
    consumeRestartRequest: vi.fn(() => ({ reason: 'stale request' })),
    electron,
    launchElectron,
    logChildLifecycle: vi.fn(),
    vite: null
  });

  lifecycle.shutdown();
  electron.emit('exit', 0);

  expect(launchElectron).not.toHaveBeenCalled();
});
