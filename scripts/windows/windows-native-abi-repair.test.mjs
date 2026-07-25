// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { ensureElectronNativeAbi } from './windows-native-abi-repair.mjs';

const REPO_ROOT = 'C:\\dev\\foliole-android-lab-preview';
const PREFLIGHT = `${REPO_ROOT}\\scripts\\windows\\native-abi-preflight.ps1`;

function repairFixture(firstCode = 0) {
  const npmRunCommand = vi.fn(() => ({ args: ['npm-cli.js', 'run', 'electron:rebuild:native'], command: 'node.exe' }));
  const runCaptureCommand = vi.fn(async () => ({ code: firstCode, stderr: '', stdout: '' }));
  const runCheckedCommand = vi.fn(async () => undefined);
  return { npmRunCommand, runCaptureCommand, runCheckedCommand };
}

describe('Windows Electron native ABI repair', () => {
  it('does not rebuild when the mirror preflight passes', async () => {
    const fixture = repairFixture();

    await expect(ensureElectronNativeAbi({
      ...fixture, nativeAbiScript: PREFLIGHT, repoRoot: REPO_ROOT
    })).resolves.toBe('preflight');

    expect(fixture.npmRunCommand).not.toHaveBeenCalled();
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
    expect(fixture.runCheckedCommand).toHaveBeenNthCalledWith(
      2, 'powershell.exe', expect.any(Array), 'verify restored Electron native ABI', REPO_ROOT
    );
  });

  it('fails closed when the rebuilt module does not pass the second preflight', async () => {
    const fixture = repairFixture(1);
    fixture.runCheckedCommand
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('restored ABI is still invalid'));

    await expect(ensureElectronNativeAbi({
      ...fixture, nativeAbiScript: PREFLIGHT, repoRoot: REPO_ROOT
    })).rejects.toThrow('restored ABI is still invalid');

    expect(fixture.npmRunCommand).toHaveBeenCalledOnce();
    expect(fixture.runCheckedCommand).toHaveBeenCalledTimes(2);
  });
});
