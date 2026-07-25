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
  it('writes an isolated request and starts only the Android lab task', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-dispatch-'));
    roots.push(root);
    const calls = [];
    const paths = androidLabPaths(root);
    const result = dispatchWindowsAndroidLab({ argv: ['run', SHA], paths, runCommand: (...args) => calls.push(args) });
    expect(result.state).toBe('pending');
    expect(readJson(paths.active).commitSha).toBe(SHA);
    expect(calls).toEqual([['schtasks.exe', ['/Run', '/TN', 'FolioleAndroidLab']]]);
  });

  it('does not queue a different commit while a run is active', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-busy-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(paths.status, JSON.stringify({ commitSha: SHA, state: 'running' }));
    expect(() => dispatchWindowsAndroidLab({ argv: ['run', 'c'.repeat(40)], paths })).toThrow('active');
  });

  it('cancels only the recorded worker process tree', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-cancel-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    writeJsonAtomic(paths.status, { pid: 4321, runId: 'run-1', state: 'running' });
    const calls = [];
    const result = dispatchWindowsAndroidLab({ argv: ['cancel'], paths, runCommand: (...args) => calls.push(args) });
    expect(calls).toEqual([['taskkill.exe', ['/PID', '4321', '/T', '/F']]]);
    expect(result.errorCode).toBe('cancelled');
  });
});
