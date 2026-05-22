import path from 'node:path';

import { expect, vi } from 'vitest';

import {
  DEV_RESTART_DELIVERY_FILE,
  DEV_RESTART_INTENT_KIND,
  DEV_RESTART_INTENT_FILE,
  installDevRestartIntentWatcher
} from './devRestartIntent.js';

export function createIntentContent(overrides: Partial<{
  head: string;
  nonce: number;
  reason: string;
  requestedAt: string;
  shellAction: 'exit-shell' | 'restart-runtime';
}> = {}) {
  return JSON.stringify({
    kind: DEV_RESTART_INTENT_KIND,
    target: 'electron-dev',
    nonce: overrides.nonce ?? 7,
    requestedAt: overrides.requestedAt ?? '2026-03-15T10:00:00.000Z',
    requestedBy: 'wsl-windows-preview',
    head: overrides.head ?? 'abc123',
    reason: overrides.reason ?? 'Class B: working tree electron changes detected',
    shellAction: overrides.shellAction ?? 'restart-runtime'
  });
}

function createMissingFileError() {
  const missing = new Error('missing') as Error & { code?: string };
  missing.code = 'ENOENT';
  return missing;
}

function createTestFileSystem(args: {
  deliveryPath: string;
  getIntentContent: () => string | null;
  intentPath: string;
  onWatch: (listener: () => void, path: string) => void;
  onUnwatch: (path: string) => void;
  setIntentContent: (content: string | null) => void;
  writeDeliveryFile: (filePath: string, content: string) => void;
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
    onWatch(listener: () => void, filePath: string) {
      watchedPath = filePath;
      onChange = listener;
    },
    onUnwatch(filePath: string) {
      unwatchPath = filePath;
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

export function createWatcherHarness(options: { env?: NodeJS.ProcessEnv } = {}) {
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
    env: { ELECTRON_RENDERER_URL: 'http://127.0.0.1:24600', ...options.env },
    fileSystem,
    getWindows: () => windows,
    logger: { error, info }
  });

  return {
    error,
    exit,
    info,
    intentPath,
    relaunch,
    setIntentContent: state.setIntentContent,
    triggerChange: state.triggerChange,
    unwatchPath: state.unwatchPath,
    watchedPath: state.watchedPath,
    windows,
    writeDeliveryFile,
    watcher
  };
}
