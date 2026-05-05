import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const { saveWindowStateNow } = vi.hoisted(() => ({
  saveWindowStateNow: vi.fn()
}));

vi.mock('./ipc/windowState.js', () => ({
  saveWindowStateNow
}));

import {
  DEV_RESTART_DELIVERY_FILE,
  DEV_RESTART_INTENT_KIND,
  DEV_RESTART_INTENT_FILE,
  installDevRestartIntentWatcher
} from './devRestartIntent.js';

function createMissingFileError() {
  const missing = new Error('missing') as Error & { code?: string };
  missing.code = 'ENOENT';
  return missing;
}

function createIntentContent() {
  return JSON.stringify({
    kind: DEV_RESTART_INTENT_KIND,
    target: 'electron-dev',
    nonce: 7,
    requestedAt: '2026-03-15T10:00:00.000Z',
    requestedBy: 'wsl-windows-preview',
    head: 'abc123',
    reason: 'Class B: working tree electron changes detected'
  });
}

function createTestFileSystem(args: {
  deliveryPath: string;
  getIntentContent: () => string | null;
  intentPath: string;
  onWatch: (listener: () => void, path: string) => void;
  onUnwatch: (path: string) => void;
  setIntentContent: (content: string | null) => void;
  writeDeliveryFile: ReturnType<typeof vi.fn>;
}) {
  return {
    deleteIntentFile(filePath: string) {
      expect(filePath).toBe(args.intentPath);
      args.setIntentContent(null);
    },
    readIntentFile(filePath: string) {
      expect(filePath).toBe(args.intentPath);
      const content = args.getIntentContent();
      if (content === null) {
        throw createMissingFileError();
      }
      return content;
    },
    unwatchIntentFile(filePath: string, listener: () => void) {
      expect(listener).toBeTypeOf('function');
      args.onUnwatch(filePath);
    },
    watchIntentFile(filePath: string, listener: () => void) {
      args.onWatch(listener, filePath);
    },
    writeDeliveryFile(filePath: string, content: string) {
      expect(filePath).toBe(args.deliveryPath);
      args.writeDeliveryFile(filePath, content);
    }
  };
}

function createWatcherHarness() {
  const repoRoot = path.join('C:', 'dev', 'foliole');
  const intentPath = path.join(repoRoot, DEV_RESTART_INTENT_FILE);
  const deliveryPath = path.join(repoRoot, DEV_RESTART_DELIVERY_FILE);
  const relaunch = vi.fn();
  const exit = vi.fn();
  const info = vi.fn();
  const error = vi.fn();
  const writeDeliveryFile = vi.fn();
  let watchedPath = '';
  let unwatchPath = '';
  let onChange: (() => void) | null = null;
  let intentContent: string | null = null;
  const windows = [{ isDestroyed: () => false }, { isDestroyed: () => true }];
  const fileSystem = createTestFileSystem({
    deliveryPath,
    getIntentContent: () => intentContent,
    intentPath,
    onUnwatch(path) {
      unwatchPath = path;
    },
    onWatch(listener, path) {
      watchedPath = path;
      onChange = listener;
    },
    setIntentContent(content) {
      intentContent = content;
    },
    writeDeliveryFile
  });

  const watcher = installDevRestartIntentWatcher({
    app: { exit, relaunch },
    cwd: repoRoot,
    env: { ELECTRON_RENDERER_URL: 'http://127.0.0.1:24600' },
    fileSystem,
    getWindows: () => windows,
    logger: { error, info }
  });

  return {
    error,
    exit,
    info,
    intentPath,
    writeDeliveryFile,
    relaunch,
    windows,
    setIntentContent(content: string | null) {
      intentContent = content;
    },
    triggerChange() {
      onChange?.();
    },
    unwatchPath: () => unwatchPath,
    watchedPath: () => watchedPath,
    watcher
  };
}

function expectFirstIntentConsumption(harness: ReturnType<typeof createWatcherHarness>) {
  expect(harness.relaunch).toHaveBeenCalledTimes(1);
  expect(harness.exit).toHaveBeenCalledTimes(1);
  expect(harness.exit).toHaveBeenCalledWith(0);
  expect(saveWindowStateNow).toHaveBeenCalledTimes(1);
  expect(saveWindowStateNow).toHaveBeenCalledWith(harness.windows[0]);
  expect(harness.info).toHaveBeenCalledWith('[electron-main] consumed dev restart intent', {
    head: 'abc123',
    intentPath: harness.intentPath,
    nonce: 7,
    reason: 'Class B: working tree electron changes detected',
    requestedAt: '2026-03-15T10:00:00.000Z',
    requestedBy: 'wsl-windows-preview'
  });
  expect(harness.error).not.toHaveBeenCalled();
  expect(harness.writeDeliveryFile).toHaveBeenCalledTimes(1);
  expect(JSON.parse(harness.writeDeliveryFile.mock.calls[0][1])).toMatchObject({
    head: 'abc123',
    kind: 'foliole.electron.dev.restart-delivered.v1',
    nonce: 7,
    reason: 'Class B: working tree electron changes detected',
    requestedAt: '2026-03-15T10:00:00.000Z',
    requestedBy: 'wsl-windows-preview',
    target: 'electron-dev'
  });
}

describe('installDevRestartIntentWatcher', () => {
  it('consumes one dev restart intent exactly once, then relaunches', () => {
    const harness = createWatcherHarness();
    saveWindowStateNow.mockClear();

    expect(harness.watcher?.intentPath).toBe(harness.intentPath);
    expect(harness.watchedPath()).toBe(harness.intentPath);
    expect(harness.relaunch).not.toHaveBeenCalled();
    expect(harness.exit).not.toHaveBeenCalled();

    harness.setIntentContent(createIntentContent());
    harness.triggerChange();
    harness.triggerChange();

    expectFirstIntentConsumption(harness);

    harness.watcher?.close();
    expect(harness.unwatchPath()).toBe(harness.intentPath);
  });

  it('ignores later restart intents after relaunch was already requested', () => {
    const harness = createWatcherHarness();
    saveWindowStateNow.mockClear();

    harness.setIntentContent(createIntentContent());
    harness.triggerChange();

    harness.setIntentContent(
      JSON.stringify({
        kind: DEV_RESTART_INTENT_KIND,
        target: 'electron-dev',
        nonce: 8,
        requestedAt: '2026-03-15T10:01:00.000Z',
        requestedBy: 'wsl-windows-preview',
        head: 'def456',
        reason: 'Class B: runtime behind committed electron changes'
      })
    );
    harness.triggerChange();

    expectFirstIntentConsumption(harness);
    expect(harness.info).toHaveBeenCalledTimes(2);
    expect(harness.info).toHaveBeenNthCalledWith(2, '[electron-main] consumed dev restart intent', {
      head: 'abc123',
      intentPath: harness.intentPath,
      nonce: 7,
      reason: 'Class B: working tree electron changes detected',
      requestedAt: '2026-03-15T10:00:00.000Z',
      requestedBy: 'wsl-windows-preview'
    });
    expect(harness.error).not.toHaveBeenCalled();

    harness.watcher?.close();
  });
});
