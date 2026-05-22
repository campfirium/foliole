// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

const requestCooperativeFullRestart = vi.hoisted(() => vi.fn());

vi.mock('./windows-client-native-full-restart.mjs', () => ({ requestCooperativeFullRestart }));

const { forceRestartClient } = await import('./windows-client-native-force-restart.mjs');

function createBaseOptions(overrides = {}) {
  return {
    currentHead: async () => 'current-head',
    mode: 'full-shell-restart',
    readClientState: vi.fn(() => ({ head: 'current-head', shellPid: 101 })),
    readReadyState: vi.fn(() => ({
      appReady: { head: 'current-head', session: 'session-1' },
      windowVisible: { pid: 202 }
    })),
    recoverClientStateFromReady: vi.fn(),
    removeClientState: vi.fn(),
    repoRoot: 'D:\\C\\foliole',
    resetMarkers: vi.fn(),
    restartDeliveryFile: 'restart-delivered.json',
    saveState: vi.fn(),
    startClient: vi.fn(),
    stopClient: vi.fn(),
    wait: vi.fn(),
    ...overrides
  };
}

describe('native Windows force restart', () => {
  it('accepts a trusted current runtime when process stop is denied after full restart fallback', async () => {
    requestCooperativeFullRestart.mockResolvedValue(null);
    const options = createBaseOptions({
      stopClient: vi.fn(async () => {
        throw new Error('client stop failed: Access is denied');
      })
    });

    await expect(forceRestartClient(options)).resolves.toBeUndefined();

    expect(options.recoverClientStateFromReady).toHaveBeenCalled();
    expect(options.startClient).not.toHaveBeenCalled();
  });

  it('keeps failing when process stop is denied and only an old runtime remains', async () => {
    requestCooperativeFullRestart.mockResolvedValue(null);
    const options = createBaseOptions({
      readClientState: vi.fn(() => ({ head: 'old-head', shellPid: 101 })),
      readReadyState: vi.fn(() => ({
        appReady: { head: 'old-head', session: 'session-1' },
        windowVisible: { pid: 202 }
      })),
      stopClient: vi.fn(async () => {
        throw new Error('client stop failed: Access is denied');
      })
    });

    await expect(forceRestartClient(options)).rejects.toThrow('client stop failed');
    expect(options.startClient).not.toHaveBeenCalled();
  });
});
