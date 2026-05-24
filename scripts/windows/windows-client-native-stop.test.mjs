// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const killPid = vi.hoisted(() => vi.fn());
const runCapture = vi.hoisted(() => vi.fn());

vi.mock('./windows-client-native-process.mjs', () => ({ killPid, runCapture }));

const { stopNativeClient } = await import('./windows-client-native-stop.mjs');

describe('native Windows client stop', () => {
  beforeEach(() => {
    killPid.mockReset();
    runCapture.mockReset();
    runCapture.mockResolvedValue({ code: 0, stdout: '' });
  });

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

  it('cleans orphan Electron processes from the repo when markers are already gone', async () => {
    runCapture
      .mockResolvedValueOnce({ code: 0, stdout: '333\r\n444\r\n' })
      .mockResolvedValueOnce({ code: 0, stdout: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '' });
    killPid.mockResolvedValue(undefined);
    const removeClientState = vi.fn();
    const resetMarkers = vi.fn();

    await expect(stopNativeClient({
      print: false,
      readClientState: () => null,
      readReadyState: () => null,
      removeClientState,
      repoRoot: 'D:\\C\\foliole',
      resetMarkers
    })).resolves.toBeUndefined();

    expect(killPid).toHaveBeenCalledWith(333);
    expect(killPid).toHaveBeenCalledWith(444);
    expect(removeClientState).toHaveBeenCalledOnce();
    expect(resetMarkers).toHaveBeenCalledOnce();
  });

  it('fails when repo Electron orphan processes remain after stop attempts', async () => {
    runCapture
      .mockResolvedValueOnce({ code: 0, stdout: '333\r\n' })
      .mockResolvedValueOnce({ code: 0, stdout: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '333\r\n' });
    killPid.mockRejectedValue(new Error('Access is denied'));
    await expect(stopNativeClient({
      print: false,
      readClientState: () => null,
      readReadyState: () => null,
      removeClientState: vi.fn(),
      repoRoot: 'D:\\C\\foliole',
      resetMarkers: vi.fn()
    })).rejects.toThrow('remaining electron pids=333');
  });

  it('does not kill a stored shell pid when ownership cannot be proven', async () => {
    runCapture
      .mockResolvedValueOnce({ code: 0, stdout: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '' });

    await expect(stopNativeClient({
      print: false,
      readClientState: () => ({ shellPid: 222 }),
      readReadyState: () => null,
      removeClientState: vi.fn(),
      repoRoot: 'D:\\C\\foliole',
      resetMarkers: vi.fn()
    })).resolves.toBeUndefined();

    expect(killPid).not.toHaveBeenCalledWith(222);
  });

  it('kills a stored shell pid only when it belongs to the native dev runner', async () => {
    runCapture
      .mockResolvedValueOnce({ code: 0, stdout: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '222\r\n' })
      .mockResolvedValueOnce({ code: 0, stdout: '' });
    killPid.mockResolvedValue(undefined);

    await expect(stopNativeClient({
      print: false,
      readClientState: () => ({ shellPid: 222 }),
      readReadyState: () => null,
      removeClientState: vi.fn(),
      repoRoot: 'D:\\C\\foliole',
      resetMarkers: vi.fn()
    })).resolves.toBeUndefined();

    expect(killPid).toHaveBeenCalledWith(222);
  });

  it('cleans orphan dev shell and Vite processes from the repo', async () => {
    runCapture
      .mockResolvedValueOnce({ code: 0, stdout: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '555\r\n666\r\n' })
      .mockResolvedValueOnce({ code: 0, stdout: '' });
    killPid.mockResolvedValue(undefined);

    await expect(stopNativeClient({
      print: false,
      readClientState: () => null,
      readReadyState: () => null,
      removeClientState: vi.fn(),
      repoRoot: 'D:\\C\\foliole',
      resetMarkers: vi.fn()
    })).resolves.toBeUndefined();

    expect(killPid).toHaveBeenCalledWith(555);
    expect(killPid).toHaveBeenCalledWith(666);
  });
});
