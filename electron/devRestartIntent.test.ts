import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { saveWindowStateNow } = vi.hoisted(() => ({
  saveWindowStateNow: vi.fn()
}));
const { allowWindowCloseWithoutReadingProgressFlush, flushReadingProgressForWindows } = vi.hoisted(() => ({
  allowWindowCloseWithoutReadingProgressFlush: vi.fn(),
  flushReadingProgressForWindows: vi.fn(() => Promise.resolve())
}));

vi.mock('./ipc/windowState.js', () => ({
  saveWindowStateNow
}));
vi.mock('./readingProgressWindowFlush.js', () => ({
  allowWindowCloseWithoutReadingProgressFlush,
  flushReadingProgressForWindows
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

function createHarnessWindows() {
  return [
    {
      isDestroyed: () => false,
      webContents: {
        executeJavaScript: vi.fn(() => Promise.resolve(true)),
        isDestroyed: () => false
      }
    },
    {
      isDestroyed: () => true,
      webContents: {
        executeJavaScript: vi.fn(() => Promise.resolve(true)),
        isDestroyed: () => false
      }
    }
  ];
}

function createHarnessState() {
  let watchedPath = '';
  let unwatchPath = '';
  let onChange: (() => void) | null = null;
  let intentContent: string | null = null;
  return {
    getIntentContent: () => intentContent,
    onWatch(listener: () => void, path: string) {
      watchedPath = path;
      onChange = listener;
    },
    onUnwatch(path: string) {
      unwatchPath = path;
    },
    setIntentContent(content: string | null) {
      intentContent = content;
    },
    triggerChange() {
      onChange?.();
    },
    unwatchPath: () => unwatchPath,
    watchedPath: () => watchedPath
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
  const state = createHarnessState();
  const windows = createHarnessWindows();
  const fileSystem = createTestFileSystem({
    deliveryPath,
    getIntentContent: state.getIntentContent,
    intentPath,
    onUnwatch: state.onUnwatch,
    onWatch: state.onWatch,
    setIntentContent: state.setIntentContent,
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
    setIntentContent: state.setIntentContent,
    triggerChange: state.triggerChange,
    unwatchPath: state.unwatchPath,
    watchedPath: state.watchedPath,
    watcher
  };
}

function expectFirstIntentConsumption(harness: ReturnType<typeof createWatcherHarness>) {
  expect(harness.relaunch).toHaveBeenCalledTimes(1);
  expect(harness.exit).toHaveBeenCalledTimes(1);
  expect(harness.exit).toHaveBeenCalledWith(0);
  expect(flushReadingProgressForWindows).toHaveBeenCalledTimes(1);
  expect(flushReadingProgressForWindows).toHaveBeenCalledWith(harness.windows);
  expect(allowWindowCloseWithoutReadingProgressFlush).toHaveBeenCalledTimes(1);
  expect(allowWindowCloseWithoutReadingProgressFlush).toHaveBeenCalledWith(harness.windows[0]);
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
  const originalRuntimeHead = process.env.FOLIOLE_RUNTIME_HEAD;

  beforeEach(() => {
    vi.clearAllMocks();
    if (originalRuntimeHead === undefined) {
      delete process.env.FOLIOLE_RUNTIME_HEAD;
      return;
    }
    process.env.FOLIOLE_RUNTIME_HEAD = originalRuntimeHead;
  });

  it('consumes one dev restart intent exactly once, then relaunches', async () => {
    const harness = createWatcherHarness();
    saveWindowStateNow.mockClear();

    expect(harness.watcher?.intentPath).toBe(harness.intentPath);
    expect(harness.watchedPath()).toBe(harness.intentPath);
    expect(harness.relaunch).not.toHaveBeenCalled();
    expect(harness.exit).not.toHaveBeenCalled();

    harness.setIntentContent(createIntentContent());
    harness.triggerChange();
    harness.triggerChange();
    await Promise.resolve();

    expectFirstIntentConsumption(harness);
    expect(process.env.FOLIOLE_RUNTIME_HEAD).toBe('abc123');

    harness.watcher?.close();
    expect(harness.unwatchPath()).toBe(harness.intentPath);
  });

  it('ignores later restart intents after relaunch was already requested', async () => {
    const harness = createWatcherHarness();
    saveWindowStateNow.mockClear();

    harness.setIntentContent(createIntentContent());
    harness.triggerChange();
    await Promise.resolve();

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
    await Promise.resolve();

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
