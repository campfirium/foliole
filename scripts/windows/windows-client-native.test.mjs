// @vitest-environment node

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

import { resolveWindowsClientAction } from './windows-client-native.mjs';
import { readReadyState } from './windows-client-native-state.mjs';

it('defaults native Windows client actions to status', () => {
  expect(resolveWindowsClientAction(['node', 'script'])).toBe('status');
  expect(resolveWindowsClientAction(['node', 'script', 'restart'])).toBe('restart');
});

it('rejects unsupported native Windows client actions before process control', () => {
  expect(() => resolveWindowsClientAction(['node', 'script', 'sync'])).toThrow(
    'unsupported Windows client action: sync'
  );
});

it('uses Node-native process control instead of wrapping the legacy PowerShell client', async () => {
  const script = await readFile(path.resolve(process.cwd(), 'scripts/windows/windows-client-native.mjs'), 'utf8');
  const processScript = await readFile(path.resolve(process.cwd(), 'scripts/windows/windows-client-native-process.mjs'), 'utf8');

  expect(script).toContain("spawn(process.execPath, ['scripts/windows/electron-dev-native.mjs']");
  expect(script).toContain("stdio: ['ignore', logs.stdoutFd, logs.stderrFd]");
  expect(processScript).toContain("runCapture('taskkill.exe'");
  expect(processScript).toContain('FOLIOLE_WINDOWS_TASKKILL_TIMEOUT_MS');
  expect(script).toContain('ready.appReady.head ?? state?.head');
  expect(script).toContain('await killPid(ready?.appReady.pid)');
  expect(script).toContain('windowVisibleFile');
  expect(script).toContain('readReadyStateFiles({ appReadyFile, bridgeReadyFile, windowVisibleFile })');
  expect(script).not.toContain('.pipe(logs.');
  expect(script).not.toContain('powershell.exe');
  expect(script).not.toContain('restart-electron-dev.ps1');
  expect(script).not.toContain('buildPowerShellArgs');
});

it('treats stale ready markers with a dead runtime pid as not running', async () => {
  const tempDir = path.join(process.cwd(), '.tmp', `windows-client-native-test-${Date.now()}`);
  const appReadyFile = path.join(tempDir, 'app-ready.json');
  const bridgeReadyFile = path.join(tempDir, 'bridge-ready.json');
  const windowVisibleFile = path.join(tempDir, 'window-visible.json');
  const deadPid = 2147483647;

  await mkdir(tempDir, { recursive: true });
  try {
    await writeFile(appReadyFile, JSON.stringify({
      pid: deadPid,
      session: 'stale-session',
      stage: 'app_ready'
    }), 'utf8');
    await writeFile(bridgeReadyFile, JSON.stringify({
      payload: { bridgeAvailable: true },
      pid: deadPid,
      session: 'stale-session',
      stage: 'bridge_ready'
    }), 'utf8');
    await writeFile(windowVisibleFile, JSON.stringify({
      payload: { isVisible: true },
      pid: deadPid,
      session: 'stale-session',
      stage: 'window_visible'
    }), 'utf8');

    expect(readReadyState({ appReadyFile, bridgeReadyFile, windowVisibleFile })).toBeNull();
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

it('requires app, bridge, and visible-window markers from the same native runtime', async () => {
  const tempDir = path.join(process.cwd(), '.tmp', `windows-client-native-window-test-${Date.now()}`);
  const appReadyFile = path.join(tempDir, 'app-ready.json');
  const bridgeReadyFile = path.join(tempDir, 'bridge-ready.json');
  const windowVisibleFile = path.join(tempDir, 'window-visible.json');
  const pid = process.pid;

  await mkdir(tempDir, { recursive: true });
  try {
    await writeFile(appReadyFile, JSON.stringify({
      pid,
      session: 'same-session',
      stage: 'app_ready'
    }), 'utf8');
    await writeFile(bridgeReadyFile, JSON.stringify({
      payload: { bridgeAvailable: true },
      pid,
      session: 'same-session',
      stage: 'bridge_ready'
    }), 'utf8');

    expect(readReadyState({ appReadyFile, bridgeReadyFile, windowVisibleFile })).toBeNull();

    await writeFile(windowVisibleFile, JSON.stringify({
      payload: { isVisible: true },
      pid,
      session: 'same-session',
      stage: 'window_visible'
    }), 'utf8');

    expect(readReadyState({ appReadyFile, bridgeReadyFile, windowVisibleFile })?.windowVisible.stage).toBe('window_visible');
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});
