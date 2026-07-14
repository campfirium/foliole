// @vitest-environment node
/* global process */

import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { writeElectronDevClientState } from '../desktop/electron-dev-control-state.mjs';
import {
  requestMacosElectronFullRestart,
  requestMacosElectronRuntimeRestart,
  resetMacosElectronDev,
  stopMacosElectronDev
} from './macos-electron-dev-actions.mjs';
import { resolveMacosElectronDevPaths } from './macos-electron-dev-paths.mjs';

async function writeReady(paths, session, pid) {
  const values = [
    [paths.appReadyFile, 'app_ready', {}],
    [paths.bridgeReadyFile, 'bridge_ready', { bridgeAvailable: true }],
    [paths.windowVisibleFile, 'window_visible', { isVisible: true }]
  ];
  await Promise.all(values.map(([filePath, stage, payload]) => writeFile(
    filePath,
    `${JSON.stringify({ head: 'head-a', payload, pid, session, stage })}\n`,
    'utf8'
  )));
}

async function createRunningState() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'macos-electron-actions-'));
  const paths = resolveMacosElectronDevPaths(cwd);
  await writeElectronDevClientState(paths, { shellPid: 101, supervisorPid: 100 });
  await writeReady(paths, 'session-a', 102);
  return paths;
}

afterEach(() => vi.restoreAllMocks());

describe('macOS Electron dev actions', () => {
  it('requests a runtime restart through the existing shell request file', async () => {
    const paths = await createRunningState();
    vi.spyOn(process, 'kill').mockImplementation(() => true);
    const result = await requestMacosElectronRuntimeRestart({
      isAlive: () => true,
      paths,
      uuid: () => 'next',
      waitForCondition: async ({ evaluate }) => {
        await writeReady(paths, 'macos-daily-next', 103);
        return evaluate();
      }
    });

    expect(result).toMatchObject({ running: true });
    await expect(readFile(paths.shellRequestFile, 'utf8')).resolves.toContain('macos-daily-next');
    expect(process.kill).not.toHaveBeenCalled();
  });

  it('accepts full restart only after shell pid and boot session both change', async () => {
    const paths = await createRunningState();
    vi.spyOn(process, 'kill').mockImplementation(() => true);
    const result = await requestMacosElectronFullRestart({
      isAlive: () => true,
      paths,
      waitForCondition: async ({ evaluate }) => {
        await writeElectronDevClientState(paths, { shellPid: 201, supervisorPid: 100 });
        await writeReady(paths, 'session-b', 202);
        return evaluate();
      }
    });

    expect(result).toMatchObject({ running: true });
    expect(process.kill).toHaveBeenCalledWith(100, 'SIGHUP');
  });

  it('fails full restart promptly when the supervisor preserves the old shell after compile failure', async () => {
    const paths = await createRunningState();
    vi.spyOn(process, 'kill').mockImplementation(() => true);
    await expect(requestMacosElectronFullRestart({
      isAlive: () => true,
      paths,
      waitForCondition: async ({ evaluate }) => {
        await writeElectronDevClientState(paths, {
          lastControl: { action: 'full-restart', id: 'control-b', status: 'compile-failed' },
          shellPid: 101,
          supervisorPid: 100
        });
        return evaluate();
      }
    })).rejects.toThrow('old shell preserved');
  });

  it('stops cooperatively when the supervisor removes its state file', async () => {
    const paths = await createRunningState();
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    await expect(stopMacosElectronDev({
      isAlive: () => true,
      paths,
      waitForCondition: async ({ evaluate }) => {
        await rm(paths.clientStateFile, { force: true });
        return evaluate();
      }
    })).resolves.toBe(true);
    expect(process.kill).toHaveBeenCalledWith(100, 'SIGTERM');
  });

  it('resets only the validated daily root and preserves reset-preview state', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'macos-electron-reset-'));
    const paths = resolveMacosElectronDevPaths(cwd);
    const dailySentinel = path.join(paths.dailyRoot, 'library', 'daily.txt');
    const previewSentinel = path.join(paths.resetPreviewRoot, 'preview.txt');
    await mkdir(path.dirname(dailySentinel), { recursive: true });
    await mkdir(path.dirname(previewSentinel), { recursive: true });
    await writeFile(dailySentinel, 'daily', 'utf8');
    await writeFile(previewSentinel, 'preview', 'utf8');

    await resetMacosElectronDev({ env: {}, homeDir: path.join(cwd, 'home'), paths, platform: 'darwin' });

    await expect(access(paths.dailyRoot)).rejects.toThrow();
    await expect(readFile(previewSentinel, 'utf8')).resolves.toBe('preview');
  });
});
