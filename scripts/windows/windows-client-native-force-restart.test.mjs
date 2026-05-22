// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const requestCooperativeFullRestart = vi.hoisted(() => vi.fn());
const writeRestartIntent = vi.hoisted(() => vi.fn());

vi.mock('./windows-client-native-full-restart.mjs', () => ({ requestCooperativeFullRestart }));
vi.mock('./write-restart-intent.mjs', () => ({ writeRestartIntent }));

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

async function createDeliveredRestartFile(nonce = 9) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-force-restart-'));
  const restartDeliveryFile = path.join(tempDir, 'restart-delivered.json');
  await writeFile(restartDeliveryFile, JSON.stringify({ nonce }), 'utf8');
  return { restartDeliveryFile, tempDir };
}

describe('native Windows force restart', () => {
  it('accepts a trusted current runtime after runtime restart fallback', async () => {
    requestCooperativeFullRestart.mockResolvedValue(null);
    writeRestartIntent.mockResolvedValue({ intent: { nonce: 9 } });
    const { restartDeliveryFile, tempDir } = await createDeliveredRestartFile(9);
    try {
      const options = createBaseOptions({ restartDeliveryFile });

      await expect(forceRestartClient(options)).resolves.toBeUndefined();

      expect(options.stopClient).not.toHaveBeenCalled();
      expect(options.recoverClientStateFromReady).toHaveBeenCalled();
      expect(options.startClient).not.toHaveBeenCalled();
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it('keeps failing when process stop is denied and only an old runtime remains', async () => {
    requestCooperativeFullRestart.mockResolvedValue(null);
    writeRestartIntent.mockResolvedValue({ intent: { nonce: 9 } });
    const { restartDeliveryFile, tempDir } = await createDeliveredRestartFile(9);
    try {
      const options = createBaseOptions({
        readClientState: vi.fn(() => ({ head: 'old-head', shellPid: 101 })),
        readReadyState: vi.fn(() => ({
          appReady: { head: 'old-head', session: 'session-1' },
          windowVisible: { pid: 202 }
        })),
        restartDeliveryFile,
        stopClient: vi.fn(async () => {
          throw new Error('client stop failed: Access is denied');
        })
      });

      await expect(forceRestartClient(options)).rejects.toThrow('client stop failed');
      expect(options.startClient).not.toHaveBeenCalled();
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });
});
