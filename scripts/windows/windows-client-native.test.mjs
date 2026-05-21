// @vitest-environment node

import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

import { resolveWindowsClientAction } from './windows-client-native.mjs';
import { readReadyState, readReadyStateFromBootEvents } from './windows-client-native-state.mjs';

it('defaults native Windows client actions to status', () => {
  expect(resolveWindowsClientAction(['node', 'script'])).toBe('status');
  expect(resolveWindowsClientAction(['node', 'script', 'restart'])).toBe('restart');
});

it('rejects unsupported native Windows client actions before process control', () => {
  expect(() => resolveWindowsClientAction(['node', 'script', 'sync'])).toThrow(
    'unsupported Windows client action: sync'
  );
});

it('starts the native dev runner through a Windows-owned process', async () => {
  const script = await readFile(path.resolve(process.cwd(), 'scripts/windows/windows-client-native.mjs'), 'utf8');
  const processScript = await readFile(path.resolve(process.cwd(), 'scripts/windows/windows-client-native-process.mjs'), 'utf8');
  const restartScript = await readFile(path.resolve(process.cwd(), 'scripts/windows/windows-client-native-restart.mjs'), 'utf8');
  const startScript = await readFile(path.resolve(process.cwd(), 'scripts/windows/start-electron-dev-native.ps1'), 'utf8');

  expect(script).toContain("'powershell.exe'");
  expect(script).toContain("'-File'");
  expect(script).toContain('nativeStartScript');
  expect(script).toContain('closeClientLogStreams(logs)');
  expect(script).toContain('native dev runner start failed');
  expect(startScript).toContain('Start-Process');
  expect(startScript).toContain('-FilePath "cmd.exe"');
  expect(startScript).toContain('-ArgumentList $launchCommand');
  expect(startScript).toContain('/d /c');
  expect(startScript).toContain('-RedirectStandardOutput $StdoutLog');
  expect(startScript).toContain('-RedirectStandardError $StderrLog');
  expect(startScript).toContain('$env:FOLIOLE_BOOT_SESSION = $Session');
  expect(startScript).toContain('$env:FOLIOLE_RUNTIME_HEAD = $RuntimeHead');
  expect(processScript).toContain("runCapture('taskkill.exe', ['/PID', String(pid), '/T', '/F']");
  expect(processScript).toContain("process.kill(pid, 'SIGTERM')");
  expect(processScript).toContain('setTimeout(() => {');
  expect(processScript).toContain('child.stdout?.destroy()');
  expect(processScript).toContain('child.stderr?.destroy()');
  expect(processScript).toContain('FOLIOLE_WINDOWS_PROCESS_EXIT_TIMEOUT_MS');
  expect(script).toContain("await forceRestartClient('dev-shell-restart')");
  expect(script).not.toContain('requestControlledRuntimeRestart');
  expect(script).not.toContain('controlled restart timed out; runtime left for inspection');
  expect(script).toContain('startup health check failed: app-ready-timeout shell_pid=');
  expect(script).toContain('ready ??= readReadyState()');
  expect(restartScript).not.toContain('forced-cleanup');
  expect(script).toContain('ready.appReady.head ?? state?.head');
  expect(script).toContain('await killPid(ready?.appReady.pid)');
  expect(script).toContain('windowVisibleFile');
  expect(script).toContain('readReadyStateFiles({ appReadyFile, bridgeReadyFile, windowVisibleFile })');
  expect(script).not.toContain('.pipe(logs.');
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

it('accepts renderer and main-process markers for the same native session', async () => {
  const tempDir = path.join(process.cwd(), '.tmp', `windows-client-native-window-test-${Date.now()}`);
  const appReadyFile = path.join(tempDir, 'app-ready.json');
  const bridgeReadyFile = path.join(tempDir, 'bridge-ready.json');
  const windowVisibleFile = path.join(tempDir, 'window-visible.json');
  const main = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
    stdio: 'ignore',
    windowsHide: true
  });
  const pid = process.pid;
  const mainPid = main.pid;

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
      pid: mainPid,
      session: 'same-session',
      stage: 'window_visible'
    }), 'utf8');

    expect(readReadyState({ appReadyFile, bridgeReadyFile, windowVisibleFile })?.windowVisible.stage).toBe('window_visible');

    await writeFile(appReadyFile, JSON.stringify({
      pid,
      session: 'other-session',
      stage: 'app_ready'
    }), 'utf8');
    expect(readReadyState({ appReadyFile, bridgeReadyFile, windowVisibleFile })).toBeNull();

    await writeFile(appReadyFile, JSON.stringify({
      pid,
      session: 'same-session',
      stage: 'app_ready'
    }), 'utf8');
    await writeFile(bridgeReadyFile, JSON.stringify({
      payload: { bridgeAvailable: true },
      pid,
      session: 'other-session',
      stage: 'bridge_ready'
    }), 'utf8');
    expect(readReadyState({ appReadyFile, bridgeReadyFile, windowVisibleFile })).toBeNull();

    await writeFile(bridgeReadyFile, JSON.stringify({
      payload: { bridgeAvailable: true },
      pid,
      session: 'same-session',
      stage: 'bridge_ready'
    }), 'utf8');
    await writeFile(windowVisibleFile, JSON.stringify({
      payload: { isVisible: true },
      pid: mainPid,
      session: 'other-session',
      stage: 'window_visible'
    }), 'utf8');

    expect(readReadyState({ appReadyFile, bridgeReadyFile, windowVisibleFile })).toBeNull();
  } finally {
    main.kill();
    await rm(tempDir, { force: true, recursive: true });
  }
});

it('recovers trusted ready state from boot events when marker files are missing', async () => {
  const tempDir = path.join(process.cwd(), '.tmp', `windows-client-native-events-test-${Date.now()}`);
  const eventLogFile = path.join(tempDir, 'native-boot-events.ndjson');
  const main = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
    stdio: 'ignore',
    windowsHide: true
  });

  await mkdir(tempDir, { recursive: true });
  try {
    const eventBase = { head: 'head-1', pid: main.pid, session: 'session-from-events', source: 'main' };
    await writeFile(eventLogFile, [
      JSON.stringify({
        ...eventBase,
        payload: { isVisible: true },
        stage: 'window_visible'
      }),
      JSON.stringify({
        ...eventBase,
        payload: { bridgeAvailable: true },
        source: 'renderer',
        stage: 'bridge_ready'
      }),
      JSON.stringify({
        ...eventBase,
        payload: { readyState: 'complete' },
        source: 'renderer',
        stage: 'app_ready'
      })
    ].join('\n'), 'utf8');

    expect(readReadyStateFromBootEvents(eventLogFile)?.appReady.session).toBe('session-from-events');
  } finally {
    main.kill();
    await rm(tempDir, { force: true, recursive: true });
  }
});
