// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

const killPid = vi.hoisted(() => vi.fn());

vi.mock('./windows-client-native-process.mjs', () => ({ killPid }));

const { stopNativeClient } = await import('./windows-client-native-stop.mjs');

describe('native Windows client stop', () => {
  it('continues cleanup when one process kill is denied but the runtime is gone', async () => {
    killPid
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Access is denied'))
      .mockResolvedValueOnce(undefined);
    const removeClientState = vi.fn();
    const resetMarkers = vi.fn();
    const readReadyState = vi.fn()
      .mockReturnValueOnce({ appReady: { pid: 123 } })
      .mockReturnValueOnce(null);

    await expect(stopNativeClient({
      print: false,
      readClientState: () => ({ runtimePid: 111, shellPid: 222 }),
      readReadyState,
      removeClientState,
      resetMarkers
    })).resolves.toBeUndefined();

    expect(removeClientState).toHaveBeenCalledOnce();
    expect(resetMarkers).toHaveBeenCalledOnce();
  });

  it('fails when a trusted runtime remains after stop attempts', async () => {
    killPid.mockRejectedValue(new Error('Access is denied'));
    await expect(stopNativeClient({
      print: false,
      readClientState: () => ({ runtimePid: 111, shellPid: 222 }),
      readReadyState: () => ({ appReady: { pid: 111 } }),
      removeClientState: vi.fn(),
      resetMarkers: vi.fn()
    })).rejects.toThrow('client stop failed');
  });
});
