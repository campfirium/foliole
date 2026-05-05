import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
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

function createWatcherHarness() {
  const repoRoot = path.join('C:', 'dev', 'foliole');
  const intentPath = path.join(repoRoot, DEV_RESTART_INTENT_FILE);
  const relaunch = vi.fn();
  const exit = vi.fn();
  const info = vi.fn();
  const error = vi.fn();
  let watchedPath = '';
  let unwatchPath = '';
  let onChange: (() => void) | null = null;
  let intentContent: string | null = null;

  const watcher = installDevRestartIntentWatcher({
    app: { exit, relaunch },
    cwd: repoRoot,
    env: { ELECTRON_RENDERER_URL: 'http://127.0.0.1:24600' },
    fileSystem: {
      deleteIntentFile(filePath: string) {
        expect(filePath).toBe(intentPath);
        intentContent = null;
      },
      readIntentFile(filePath: string) {
        expect(filePath).toBe(intentPath);
        if (intentContent === null) {
          throw createMissingFileError();
        }
        return intentContent;
      },
      unwatchIntentFile(filePath: string, listener: () => void) {
        unwatchPath = filePath;
        expect(listener).toBe(onChange);
      },
      watchIntentFile(filePath: string, listener: () => void) {
        watchedPath = filePath;
        onChange = listener;
      }
    },
    logger: { error, info }
  });

  return {
    error,
    exit,
    info,
    intentPath,
    relaunch,
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

describe('installDevRestartIntentWatcher', () => {
  it('consumes one dev restart intent exactly once, then relaunches', () => {
    const harness = createWatcherHarness();

    expect(harness.watcher?.intentPath).toBe(harness.intentPath);
    expect(harness.watchedPath()).toBe(harness.intentPath);
    expect(harness.relaunch).not.toHaveBeenCalled();
    expect(harness.exit).not.toHaveBeenCalled();

    harness.setIntentContent(createIntentContent());
    harness.triggerChange();
    harness.triggerChange();

    expect(harness.relaunch).toHaveBeenCalledTimes(1);
    expect(harness.exit).toHaveBeenCalledTimes(1);
    expect(harness.exit).toHaveBeenCalledWith(0);
    expect(harness.info).toHaveBeenCalledWith('[electron-main] consumed dev restart intent', {
      head: 'abc123',
      intentPath: harness.intentPath,
      nonce: 7,
      reason: 'Class B: working tree electron changes detected',
      requestedAt: '2026-03-15T10:00:00.000Z',
      requestedBy: 'wsl-windows-preview'
    });
    expect(harness.error).not.toHaveBeenCalled();

    harness.watcher?.close();
    expect(harness.unwatchPath()).toBe(harness.intentPath);
  });
});
