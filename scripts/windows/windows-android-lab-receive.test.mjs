// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ANDROID_LAB_RECEIVE_COMMAND, ANDROID_LAB_REPAIR_RECEIVE_COMMAND, ANDROID_LAB_RUNTIME_RECEIVE_COMMAND,
  runWindowsAndroidLabReceive
} from './windows-android-lab-receive.mjs';
import { androidLabPaths, writeJsonAtomic } from './windows-android-lab-state.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

describe('Windows Android lab Git receive bridge', () => {
  it('spawns only configured Git receive-pack for the fixed bare repository', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-receive-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    writeJsonAtomic(paths.config, { gitPath: 'C:\\Git\\git.exe' });
    const child = { on: vi.fn() };
    const spawnImpl = vi.fn(() => child);
    expect(runWindowsAndroidLabReceive({ env: { SSH_ORIGINAL_COMMAND: ANDROID_LAB_RECEIVE_COMMAND }, paths, spawnImpl })).toBe(child);
    expect(spawnImpl).toHaveBeenCalledWith('C:\\Git\\git.exe', ['receive-pack', paths.repository], {
      shell: false, stdio: 'inherit'
    });
  });

  it('rejects every non-Git command before spawning a process', () => {
    const spawnImpl = vi.fn();
    expect(() => runWindowsAndroidLabReceive({ env: { SSH_ORIGINAL_COMMAND: 'whoami' }, spawnImpl })).toThrow('fixed receive-pack');
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('allows non-fast-forward only for the fixed repair repository command', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-receive-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    writeJsonAtomic(paths.config, { gitPath: 'C:\\Git\\git.exe' });
    const spawnImpl = vi.fn(() => ({ on: vi.fn() }));
    runWindowsAndroidLabReceive({ env: { SSH_ORIGINAL_COMMAND: ANDROID_LAB_REPAIR_RECEIVE_COMMAND }, paths, spawnImpl });
    expect(spawnImpl).toHaveBeenCalledWith('C:\\Git\\git.exe', [
      '-c', 'receive.denyNonFastForwards=false', 'receive-pack', paths.repository
    ], { shell: false, stdio: 'inherit' });
  });

  it('routes runtime objects only to the isolated fixed runtime repository', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-receive-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    writeJsonAtomic(paths.config, { gitPath: 'C:\\Git\\git.exe' });
    const spawnImpl = vi.fn(() => ({ on: vi.fn() }));
    runWindowsAndroidLabReceive({ env: { SSH_ORIGINAL_COMMAND: ANDROID_LAB_RUNTIME_RECEIVE_COMMAND }, paths, spawnImpl });
    expect(spawnImpl).toHaveBeenCalledWith('C:\\Git\\git.exe', [
      'receive-pack', paths.runtimeRepository
    ], { shell: false, stdio: 'inherit' });
  });
});
