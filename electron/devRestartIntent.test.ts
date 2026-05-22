import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  createIntentContent,
  createWatcherHarness
} from './devRestartIntent.testSupport.js';

const originalRuntimeHead = process.env.FOLIOLE_RUNTIME_HEAD;
const originalBootSession = process.env.FOLIOLE_BOOT_SESSION;
const originalShellRestartRequestFile = process.env.FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE;
const tempDirs: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  if (originalRuntimeHead === undefined) {
    delete process.env.FOLIOLE_RUNTIME_HEAD;
  } else {
    process.env.FOLIOLE_RUNTIME_HEAD = originalRuntimeHead;
  }
  if (originalBootSession === undefined) {
    delete process.env.FOLIOLE_BOOT_SESSION;
  } else {
    process.env.FOLIOLE_BOOT_SESSION = originalBootSession;
  }
  if (originalShellRestartRequestFile === undefined) {
    delete process.env.FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE;
  } else {
    process.env.FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE = originalShellRestartRequestFile;
  }
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-dev-restart-intent-'));
  tempDirs.push(dir);
  return dir;
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
  expect(JSON.parse(harness.writeDeliveryFile.mock.calls[0]?.[1] ?? '{}')).toMatchObject({
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
    await Promise.resolve();

    expectFirstIntentConsumption(harness);
    expect(process.env.FOLIOLE_RUNTIME_HEAD).toBe('abc123');
    expect(process.env.FOLIOLE_BOOT_SESSION).toMatch(/^windows-native-relaunch-7-/);
    expect(harness.relaunch).toHaveBeenCalledWith({
      args: expect.arrayContaining([expect.stringMatching(/^--foliole-boot-session=windows-native-relaunch-7-/)])
    });

    harness.watcher?.close();
    expect(harness.unwatchPath()).toBe(harness.intentPath);
  });

  it('ignores later restart intents after relaunch was already requested', async () => {
    const harness = createWatcherHarness();
    saveWindowStateNow.mockClear();

    harness.setIntentContent(createIntentContent());
    harness.triggerChange();
    await Promise.resolve();
    await Promise.resolve();

    harness.setIntentContent(createIntentContent({
      head: 'def456',
      nonce: 8,
      reason: 'Class B: runtime behind committed electron changes',
      requestedAt: '2026-03-15T10:01:00.000Z'
    }));
    harness.triggerChange();
    await Promise.resolve();
    await Promise.resolve();

    expectFirstIntentConsumption(harness);
    expect(harness.relaunch).toHaveBeenCalledTimes(1);
    expect(process.env.FOLIOLE_BOOT_SESSION).toMatch(/^windows-native-relaunch-7-/);
    expect(harness.error).not.toHaveBeenCalled();

    harness.watcher?.close();
  });
});

describe('shell-managed dev restarts', () => {
  it('consumes restart intents without in-app relaunch when the dev shell owns restarts', async () => {
    const requestFile = path.join(createTempDir(), 'shell-restart.json');
    process.env.FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE = requestFile;
    const harness = createWatcherHarness({
      env: {
        FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE: requestFile,
        FOLIOLE_DISABLE_IN_APP_RELAUNCH: '1'
      }
    });

    harness.setIntentContent(createIntentContent());
    harness.triggerChange();
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.relaunch).not.toHaveBeenCalled();
    expect(harness.exit).toHaveBeenCalledWith(0);
    expect(flushReadingProgressForWindows).toHaveBeenCalledWith(harness.windows);
    expect(saveWindowStateNow).toHaveBeenCalledWith(harness.windows[0]);
    expect(harness.writeDeliveryFile).toHaveBeenCalledTimes(1);
    const shellRequest = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    expect(shellRequest).toMatchObject({
      kind: 'foliole-dev-shell-restart',
      reason: 'Class B: working tree electron changes detected',
      runtimeHead: 'abc123',
      shellAction: 'restart-runtime'
    });
    expect(shellRequest.bootSession).toMatch(/^windows-native-relaunch-7-/);
    expect(harness.info).toHaveBeenCalledWith('[electron-main] ignored dev restart intent because relaunch is shell-managed', {
      intentPath: harness.intentPath,
      nonce: 7
    });

    harness.watcher?.close();
  });

  it('passes full shell restart intent through to the dev shell request', async () => {
    const requestFile = path.join(createTempDir(), 'shell-exit.json');
    process.env.FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE = requestFile;
    const harness = createWatcherHarness({
      env: {
        FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE: requestFile,
        FOLIOLE_DISABLE_IN_APP_RELAUNCH: '1'
      }
    });

    harness.setIntentContent(createIntentContent({ shellAction: 'exit-shell' }));
    harness.triggerChange();
    await Promise.resolve();
    await Promise.resolve();

    const shellRequest = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    expect(shellRequest).toMatchObject({
      kind: 'foliole-dev-shell-restart',
      shellAction: 'exit-shell'
    });
    expect(harness.exit).toHaveBeenCalledWith(0);

    harness.watcher?.close();
  });
});
