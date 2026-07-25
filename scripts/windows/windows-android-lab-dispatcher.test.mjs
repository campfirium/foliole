// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { dispatchWindowsAndroidLab } from './windows-android-lab-dispatcher.mjs';
import { androidLabPaths, readJson, writeJsonAtomic } from './windows-android-lab-state.mjs';

const roots = [];
const SHA = 'b'.repeat(40);
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

describe('Windows Android lab dispatcher', () => {
  it('writes an isolated request and starts only the Android lab task', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-dispatch-'));
    roots.push(root);
    const calls = [];
    const paths = androidLabPaths(root);
    const result = await dispatchWindowsAndroidLab({ argv: ['run', SHA], now: 1_000, paths, runCommand: (...args) => calls.push(args) });
    expect(result.state).toBe('pending');
    expect(readJson(paths.active).commitSha).toBe(SHA);
    expect(calls).toEqual([['schtasks.exe', ['/Run', '/TN', 'FolioleAndroidLab']]]);
  });

  it('does not queue a different commit while a run is active', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-busy-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(paths.status, JSON.stringify({ commitSha: SHA, state: 'running' }));
    await expect(dispatchWindowsAndroidLab({ argv: ['run', 'c'.repeat(40)], paths })).rejects.toThrow('active');
  });

  it('cancels only the recorded worker process tree', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-cancel-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    writeJsonAtomic(paths.status, { pid: 4321, runId: 'run-1', state: 'running' });
    const calls = [];
    const result = await dispatchWindowsAndroidLab({ argv: ['cancel'], paths, runCommand: (...args) => calls.push(args) });
    expect(calls).toEqual([['taskkill.exe', ['/PID', '4321', '/T', '/F']]]);
    expect(result.errorCode).toBe('cancelled');
  });

  it('closes stale pending state so a new commit can run', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-stale-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    writeJsonAtomic(paths.active, { commitSha: SHA, runId: 'stale' });
    writeJsonAtomic(paths.status, { commitSha: SHA, createdAt: new Date(0).toISOString(), runId: 'stale', state: 'pending' });
    const stale = await dispatchWindowsAndroidLab({ argv: ['status'], now: 61_000, paths });
    expect(stale).toMatchObject({ errorCode: 'worker_start_timeout', state: 'completed' });
    expect(fs.existsSync(paths.active)).toBe(false);
    const next = await dispatchWindowsAndroidLab({
      argv: ['run', 'c'.repeat(40)], now: 62_000, paths, runCommand: () => undefined
    });
    expect(next).toMatchObject({ commitSha: 'c'.repeat(40), state: 'pending' });
  });

  it('cancels pending without calling taskkill', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-pending-cancel-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    writeJsonAtomic(paths.active, { runId: 'pending' });
    writeJsonAtomic(paths.status, { createdAt: new Date().toISOString(), runId: 'pending', state: 'pending' });
    const calls = [];
    const result = await dispatchWindowsAndroidLab({ argv: ['cancel'], paths, runCommand: (...args) => calls.push(args) });
    expect(result).toMatchObject({ errorCode: 'cancelled', state: 'completed' });
    expect(calls).toEqual([]);
    expect(fs.existsSync(paths.active)).toBe(false);
  });

  it('closes the request when the scheduled task cannot start', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-start-failed-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    await expect(dispatchWindowsAndroidLab({
      argv: ['run', SHA], now: 1_000, paths, runCommand: () => ({ code: 1, output: 'disabled' })
    })).rejects.toMatchObject({ code: 'scheduled_task_start_failed' });
    expect(readJson(paths.status)).toMatchObject({ errorCode: 'scheduled_task_start_failed', state: 'completed' });
    expect(fs.existsSync(paths.active)).toBe(false);
  });
});
