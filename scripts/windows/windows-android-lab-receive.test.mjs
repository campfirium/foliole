// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ANDROID_LAB_RECEIVE_COMMAND, ANDROID_LAB_REPAIR_RECEIVE_COMMAND, ANDROID_LAB_RUNTIME_RECEIVE_COMMAND,
  ensureAndroidLabRuntimeRepository, runWindowsAndroidLabReceive
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
    const spawnSyncImpl = vi.fn(() => ({ status: 0 }));
    runWindowsAndroidLabReceive({
      env: { SSH_ORIGINAL_COMMAND: ANDROID_LAB_RUNTIME_RECEIVE_COMMAND }, paths, spawnImpl, spawnSyncImpl
    });
    expect(spawnSyncImpl.mock.calls.map((call) => call[1])).toEqual([
      ['init', '--bare', paths.runtimeRepository],
      ['--git-dir', paths.runtimeRepository, 'config', 'receive.denyDeletes', 'true'],
      ['--git-dir', paths.runtimeRepository, 'config', 'receive.denyNonFastForwards', 'true']
    ]);
    expect(spawnImpl).toHaveBeenCalledWith('C:\\Git\\git.exe', [
      'receive-pack', paths.runtimeRepository
    ], { shell: false, stdio: 'inherit' });
    expect(fs.readFileSync(path.join(paths.runtimeRepository, 'hooks', 'pre-receive'), 'utf8'))
      .toContain('refs/heads/lab/runtime');
  });

  it('cannot initialize or write outside the fixed runtime repository', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-receive-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    const spawnSyncImpl = vi.fn((_git, args) => {
      if (args[0] === 'init') fs.mkdirSync(path.join(paths.runtimeRepository), { recursive: true });
      return { status: 0 };
    });
    ensureAndroidLabRuntimeRepository({ gitPath: 'C:\\Git\\git.exe', paths, spawnSyncImpl });
    expect(fs.readdirSync(root)).toEqual(['runtime-repository.git']);
    expect(fs.readdirSync(paths.runtimeRepository)).toEqual(['hooks']);
  });
});
