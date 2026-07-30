// @vitest-environment node
/* global process */

import { describe, expect, it, vi } from 'vitest';

import { runNativeLinuxAndroidHost } from './native-linux-host.mjs';

describe('native Linux Android host', () => {
  it('refuses non-Linux callers before starting a host command', async () => {
    const runner = vi.fn();

    expect(await runNativeLinuxAndroidHost('gradle', ['lint'], { platform: 'win32', runner })).toBe(2);
    expect(runner).not.toHaveBeenCalled();
  });

  it('keeps hosted Gradle checks on the repository Android wrapper', async () => {
    const runner = vi.fn().mockResolvedValue(0);

    expect(await runNativeLinuxAndroidHost('gradle', ['testDebugUnitTest'], {
      env: {}, platform: 'linux', runner
    })).toBe(0);
    expect(runner).toHaveBeenCalledWith('./gradlew', ['--no-daemon', 'testDebugUnitTest'], expect.objectContaining({
      env: {}
    }));
  });

  it('builds and syncs companion assets without a Windows device route', async () => {
    const runner = vi.fn().mockResolvedValue(0);

    expect(await runNativeLinuxAndroidHost('sync', [], { env: {}, platform: 'linux', runner })).toBe(0);
    expect(runner).toHaveBeenNthCalledWith(1, 'npm', ['run', 'android:web:build'], expect.any(Object));
    expect(runner).toHaveBeenNthCalledWith(2, process.execPath,
      [expect.stringContaining('@capacitor/cli/bin/capacitor'), 'sync', 'android'], expect.any(Object));
  });
});
