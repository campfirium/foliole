// @vitest-environment node
/* global console */

import { describe, expect, it, vi } from 'vitest';

import { resolveAndroidHostInvocation, runAndroidHost } from './android-host.mjs';
import { runMacosAndroidHost } from '../macos/android/android-host.mjs';

describe('android host capability router', () => {
  it.each(['control', 'emulator', 'gradle', 'logcat', 'open', 'preview', 'preview-lite', 'screenshot', 'sync'])(
    'refuses %s on macOS instead of resolving a local Android adapter',
    (command) => expect(resolveAndroidHostInvocation(command, [], { platform: 'darwin' })).toBeNull()
  );

  it('points macOS callers to the restricted Windows Android Lab controller', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runAndroidHost('preview', [], { platform: 'darwin' })).resolves.toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('windows-android-lab-control.mjs'));
    error.mockRestore();
  });

  it('preserves existing Windows/WSL adapter commands and argument boundaries', () => {
    expect(resolveAndroidHostInvocation('gradle', ['connectedDebugAndroidTest', '--class', 'Example'], { platform: 'linux' })).toEqual({
      args: ['scripts/android/windows-gradle-check.sh', 'connectedDebugAndroidTest', '--class', 'Example'],
      bin: 'bash'
    });
    expect(resolveAndroidHostInvocation('control', [], { platform: 'win32' })).toEqual({
      args: ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/android/windows-control-device.ps1'],
      bin: 'powershell.exe'
    });
  });

  it('routes hosted native Linux checks without the Windows mirror adapter', () => {
    expect(resolveAndroidHostInvocation('sync', [], {
      hostMode: 'native-linux', nodeBin: '/node', platform: 'linux'
    })).toEqual({
      args: ['scripts/android/native-linux-host.mjs', 'sync'],
      bin: '/node'
    });
    expect(resolveAndroidHostInvocation('gradle', ['lint'], {
      hostMode: 'native-linux', nodeBin: '/node', platform: 'linux'
    })).toEqual({
      args: ['scripts/android/native-linux-host.mjs', 'gradle', 'lint'],
      bin: '/node'
    });
  });

  it('keeps Windows preview behind the shared host entry', () => {
    expect(resolveAndroidHostInvocation('preview', [], { platform: 'linux' })).toEqual({
      args: ['scripts/android/android-preview.sh'],
      bin: 'bash'
    });
  });

  it('rejects unknown capabilities', () => {
    expect(resolveAndroidHostInvocation('missing', [], { platform: 'darwin' })).toBeNull();
    expect(resolveAndroidHostInvocation('missing', [], { platform: 'linux' })).toBeNull();
  });
});

describe('direct macOS Android adapter boundary', () => {
  it.each(['control', 'emulator', 'gradle', 'logcat', 'open', 'preview', 'preview-lite', 'screenshot', 'sync'])(
    'refuses direct %s execution and points to the Windows controller',
    async (command) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(runMacosAndroidHost(command, [])).resolves.toBe(2);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('windows-android-lab-control.mjs'));
      error.mockRestore();
    }
  );
});
