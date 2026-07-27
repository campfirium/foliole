// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { electronRebuildSourceCommand, ensureElectronNativeAbi } from './windows-native-abi-repair.mjs';

const REPO_ROOT = 'C:\\dev\\foliole-android-lab-preview';
const PREFLIGHT = `${REPO_ROOT}\\scripts\\windows\\native-abi-preflight.ps1`;

function repairFixture(firstCode = 0, secondCode = 0) {
  const createNpmCommand = vi.fn(() => ({
    args: ['npm-cli.js', 'exec', '--', 'electron-rebuild', '-f', '--build-from-source'],
    command: 'node.exe'
  }));
  const npmRunCommand = vi.fn(() => ({ args: ['npm-cli.js', 'run', 'electron:rebuild:native'], command: 'node.exe' }));
  const runCaptureCommand = vi.fn()
    .mockResolvedValueOnce({ code: firstCode, stderr: '', stdout: '' })
    .mockResolvedValueOnce({ code: secondCode, stderr: '', stdout: '' })
    .mockResolvedValue({ code: 0, stderr: '', stdout: '' });
  const runCheckedCommand = vi.fn(async () => undefined);
  return { createNpmCommand, npmRunCommand, runCaptureCommand, runCheckedCommand };
}

describe('Windows Electron native ABI repair', () => {
  it('builds the source rebuild command through npm exec in the mirror cwd', () => {
    const createNpmCommand = vi.fn((args) => ({ args, command: 'node.exe' }));

    expect(electronRebuildSourceCommand(createNpmCommand)).toEqual({
      args: [
        'exec', '--', 'electron-rebuild',
        '-f', '--build-from-source', '-w', 'better-sqlite3', '-m', '.', '-s'
      ],
      command: 'node.exe'
    });
  });

  it('does not rebuild when the mirror preflight passes', async () => {
    const fixture = repairFixture();

    await expect(ensureElectronNativeAbi({
      ...fixture, nativeAbiScript: PREFLIGHT, repoRoot: REPO_ROOT
    })).resolves.toBe('preflight');

    expect(fixture.npmRunCommand).not.toHaveBeenCalled();
    expect(fixture.createNpmCommand).not.toHaveBeenCalled();
    expect(fixture.runCheckedCommand).not.toHaveBeenCalled();
  });

  it('rebuilds once in the mirror and then verifies the Electron ABI again', async () => {
    const fixture = repairFixture(1);

    await expect(ensureElectronNativeAbi({
      ...fixture, nativeAbiScript: PREFLIGHT, repoRoot: REPO_ROOT
    })).resolves.toBe('rebuilt');

    expect(fixture.npmRunCommand).toHaveBeenCalledOnce();
    expect(fixture.npmRunCommand).toHaveBeenCalledWith('electron:rebuild:native');
    expect(fixture.runCheckedCommand).toHaveBeenNthCalledWith(
      1, 'node.exe', ['npm-cli.js', 'run', 'electron:rebuild:native'], 'restore Electron native ABI', REPO_ROOT
    );
    expect(fixture.runCaptureCommand).toHaveBeenCalledTimes(2);
    expect(fixture.createNpmCommand).not.toHaveBeenCalled();
  });

  it('falls back to a source rebuild when the restored module still fails preflight', async () => {
    const fixture = repairFixture(1, 1);

    await expect(ensureElectronNativeAbi({
      ...fixture, nativeAbiScript: PREFLIGHT, repoRoot: REPO_ROOT
    })).resolves.toBe('source-rebuilt');

    expect(fixture.npmRunCommand).toHaveBeenCalledOnce();
    expect(fixture.runCheckedCommand).toHaveBeenCalledTimes(2);
    expect(fixture.runCheckedCommand).toHaveBeenNthCalledWith(
      1, 'node.exe', ['npm-cli.js', 'run', 'electron:rebuild:native'], 'restore Electron native ABI', REPO_ROOT
    );
    expect(fixture.runCheckedCommand).toHaveBeenNthCalledWith(
      2, 'powershell.exe', expect.any(Array), 'verify source-restored Electron native ABI', REPO_ROOT
    );
    expect(fixture.createNpmCommand).toHaveBeenCalledWith([
      'exec', '--', 'electron-rebuild',
      '-f', '--build-from-source', '-w', 'better-sqlite3', '-m', '.', '-s'
    ]);
  });

  it('fails closed when the source-restored module does not pass the final preflight', async () => {
    const fixture = repairFixture(1, 1);
    fixture.runCheckedCommand
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('source-restored ABI is still invalid'));

    await expect(ensureElectronNativeAbi({
      ...fixture, nativeAbiScript: PREFLIGHT, repoRoot: REPO_ROOT
    })).rejects.toThrow('source-restored ABI is still invalid');

    expect(fixture.npmRunCommand).toHaveBeenCalledOnce();
    expect(fixture.runCheckedCommand).toHaveBeenCalledTimes(2);
  });
});
