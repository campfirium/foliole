import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  DEV_RENDERER_RELOAD_DELIVERY_FILE,
  DEV_RENDERER_RELOAD_INTENT_FILE,
  DEV_RENDERER_RELOAD_INTENT_KIND,
  installDevRendererReloadIntentWatcher
} from './devRendererReloadIntent.js';

function createMissingFileError() {
  const missing = new Error('missing') as Error & { code?: string };
  missing.code = 'ENOENT';
  return missing;
}

function createIntentContent() {
  return JSON.stringify({
    kind: DEV_RENDERER_RELOAD_INTENT_KIND,
    target: 'electron-dev-renderer',
    nonce: 4,
    requestedAt: '2026-03-18T12:20:00.000Z',
    requestedBy: 'wsl-windows-preview',
    head: 'abc123',
    reason: 'Class A: renderer-only sync path'
  });
}

function createWatcherState() {
  return {
    hasWindow: true,
    intentContent: null as string | null,
    onChange: null as (() => void) | null,
    writeDeliveryFile: vi.fn(),
    unwatchPath: '',
    watchedPath: ''
  };
}

function createTestFileSystem(intentPath: string, state: ReturnType<typeof createWatcherState>) {
  return {
    deleteIntentFile(filePath: string) {
      expect(filePath).toBe(intentPath);
      state.intentContent = null;
    },
    readIntentFile(filePath: string) {
      expect(filePath).toBe(intentPath);
      if (state.intentContent === null) {
        throw createMissingFileError();
      }
      return state.intentContent;
    },
    unwatchIntentFile(filePath: string, listener: () => void) {
      state.unwatchPath = filePath;
      expect(listener).toBe(state.onChange);
    },
    watchIntentFile(filePath: string, listener: () => void) {
      state.watchedPath = filePath;
      state.onChange = listener;
    },
    writeDeliveryFile(filePath: string, content: string) {
      expect(filePath).toBe(path.join(path.dirname(intentPath), DEV_RENDERER_RELOAD_DELIVERY_FILE));
      state.writeDeliveryFile(filePath, content);
    }
  };
}

function createWatcherHarness() {
  const repoRoot = path.join('C:', 'dev', 'foliole');
  const intentPath = path.join(repoRoot, DEV_RENDERER_RELOAD_INTENT_FILE);
  const reloadIgnoringCache = vi.fn();
  const info = vi.fn();
  const error = vi.fn();
  const state = createWatcherState();

  const watcher = installDevRendererReloadIntentWatcher({
    cwd: repoRoot,
    env: { ELECTRON_RENDERER_URL: 'http://127.0.0.1:24600' },
    fileSystem: createTestFileSystem(intentPath, state),
    getWindows: () =>
      state.hasWindow
        ? [
            {
              isDestroyed: () => false,
              webContents: { reloadIgnoringCache }
            }
          ]
        : [],
    logger: { error, info }
  });

  return {
    error,
    info,
    intentPath,
    reloadIgnoringCache,
    writeDeliveryFile: state.writeDeliveryFile,
    setHasWindow(next: boolean) {
      state.hasWindow = next;
    },
    setIntentContent(content: string | null) {
      state.intentContent = content;
    },
    triggerChange() {
      state.onChange?.();
    },
    unwatchPath: () => state.unwatchPath,
    watchedPath: () => state.watchedPath,
    watcher
  };
}

describe('installDevRendererReloadIntentWatcher', () => {
  it('consumes one renderer reload intent exactly once, then reloads visible windows', () => {
    const harness = createWatcherHarness();

    expect(harness.watcher?.intentPath).toBe(harness.intentPath);
    expect(harness.watchedPath()).toBe(harness.intentPath);

    harness.setIntentContent(createIntentContent());
    harness.triggerChange();
    harness.triggerChange();

    expect(harness.reloadIgnoringCache).toHaveBeenCalledTimes(1);
    expect(harness.info).toHaveBeenCalledWith('[electron-main] consumed dev renderer reload intent', {
      head: 'abc123',
      intentPath: harness.intentPath,
      nonce: 4,
      reason: 'Class A: renderer-only sync path',
      requestedAt: '2026-03-18T12:20:00.000Z',
      requestedBy: 'wsl-windows-preview',
      windowCount: 1
    });
    expect(harness.error).not.toHaveBeenCalled();
    expect(harness.writeDeliveryFile).toHaveBeenCalledTimes(1);
    expect(JSON.parse(harness.writeDeliveryFile.mock.calls[0][1])).toMatchObject({
      head: 'abc123',
      kind: 'foliole.electron.dev.renderer-reload-delivered.v1',
      nonce: 4,
      reason: 'Class A: renderer-only sync path',
      requestedAt: '2026-03-18T12:20:00.000Z',
      requestedBy: 'wsl-windows-preview',
      target: 'electron-dev-renderer'
    });

    harness.watcher?.close();
    expect(harness.unwatchPath()).toBe(harness.intentPath);
  });

  it('keeps the intent file pending until a live window exists', () => {
    const harness = createWatcherHarness();

    harness.setHasWindow(false);
    harness.setIntentContent(createIntentContent());
    harness.triggerChange();

    expect(harness.reloadIgnoringCache).not.toHaveBeenCalled();

    harness.setHasWindow(true);
    harness.triggerChange();

    expect(harness.reloadIgnoringCache).toHaveBeenCalledTimes(1);
    expect(harness.writeDeliveryFile).toHaveBeenCalledTimes(1);
    harness.watcher?.close();
  });
});
