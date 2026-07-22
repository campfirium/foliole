// @vitest-environment node
/* global process */

import { describe, expect, it } from 'vitest';

import { resolveAndroidHostInvocation } from './android-host.mjs';

describe('android host capability router', () => {
  it('routes Darwin commands to the macOS adapter without Windows implementation names', () => {
    expect(resolveAndroidHostInvocation('sync', [], { nodeBin: '/node', platform: 'darwin' })).toEqual({
      args: ['scripts/macos/android/android-host.mjs', 'sync'],
      bin: '/node'
    });
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
    expect(resolveAndroidHostInvocation('missing', [], { platform: 'darwin' })).toEqual({
      args: ['scripts/macos/android/android-host.mjs', 'missing'],
      bin: process.execPath
    });
    expect(resolveAndroidHostInvocation('missing', [], { platform: 'linux' })).toBeNull();
  });
});
