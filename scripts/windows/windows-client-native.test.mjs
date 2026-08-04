// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

import { resolveWindowsClientAction } from './windows-client-native-actions.mjs';

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
  const processScript = await readFile(path.resolve(process.cwd(), 'scripts/lib/process-control.mjs'), 'utf8');
  const recoveredStateScript = await readFile(path.resolve(process.cwd(), 'scripts/windows/windows-client-native-recovered-state.mjs'), 'utf8');
  const forceRestartScript = await readFile(path.resolve(process.cwd(), 'scripts/windows/windows-client-native-force-restart.mjs'), 'utf8');
  const fullRestartScript = await readFile(path.resolve(process.cwd(), 'scripts/windows/windows-client-native-full-restart.mjs'), 'utf8');
  const runtimeRestartScript = await readFile(path.resolve(process.cwd(), 'scripts/windows/windows-client-native-runtime-restart.mjs'), 'utf8');
  const restartScript = await readFile(path.resolve(process.cwd(), 'scripts/windows/windows-client-native-restart.mjs'), 'utf8');
  const startRunnerScript = await readFile(path.resolve(process.cwd(), 'scripts/windows/windows-client-native-start-runner.mjs'), 'utf8');
  const startScript = await readFile(path.resolve(process.cwd(), 'scripts/windows/start-electron-dev-native.ps1'), 'utf8');
  const stateReadersScript = await readFile(path.resolve(process.cwd(), 'scripts/windows/windows-client-native-state-readers.mjs'), 'utf8');

  expect(startRunnerScript).toContain("'powershell.exe'");
  expect(startRunnerScript).toContain("'-File'");
  expect(script).toContain('nativeStartScript');
  expect(script).toContain('dispatchWindowsNativeClientAction');
  expect(script.indexOf('dispatchWindowsNativeClientAction')).toBeLessThan(script.indexOf("if (action === 'status')"));
  expect(script).toContain("FOLIOLE_ELECTRON_HEALTHCHECK_MS ?? '60000'");
  expect(script).toContain('closeClientLogStreams(logs)');
  expect(startRunnerScript).toContain('native dev runner start failed');
  expect(script).toContain('if (existing.ready.appReady.head === head)');
  expect(script).toContain('await stopClient({ print: false })');
  expect(script).toContain('listRepoElectronPids(repoRoot)');
  expect(script).toContain('untrusted repo runtime still running');
  expect(script).not.toContain('listRepoDevShellPids(repoRoot)');
  expect(script).not.toContain('} else {\n    await stopClient({ print: false });\n  }');
  expect(script).toContain('stopNativeClient');
  expect(script).toContain('removeShellRestartRequest(shellRestartRequestFile)');
  expect(startScript).toContain('Start-Process');
  expect(startScript).toContain('-FilePath "cmd.exe"');
  expect(startScript).toContain('-ArgumentList $launchCommand');
  expect(startScript).toContain('/d /c');
  expect(startScript).toContain('-RedirectStandardOutput $StdoutLog');
  expect(startScript).toContain('-RedirectStandardError $StderrLog');
  expect(startScript).toContain('$env:FOLIOLE_BOOT_SESSION = $Session');
  expect(startScript).toContain('$env:FOLIOLE_RUNTIME_HEAD = $RuntimeHead');
  expect(processScript).toContain("runCapture('taskkill.exe', ['/PID', String(pid), '/T', '/F']");
  expect(processScript).toContain('Stop-Process -Id ${pid} -Force -ErrorAction Stop');
  expect(processScript).toContain("process.kill(pid, 'SIGTERM')");
  expect(processScript).toContain('setTimeout(() => {');
  expect(processScript).toContain('child.stdout?.destroy()');
  expect(processScript).toContain('child.stderr?.destroy()');
  expect(processScript).toContain('FOLIOLE_WINDOWS_PROCESS_EXIT_TIMEOUT_MS');
  expect(runtimeRestartScript).toContain("mode: 'dev-shell-restart'");
  expect(script).toContain("mode: 'full-shell-restart'");
  expect(forceRestartScript).toContain('requestCooperativeFullRestart');
  expect(forceRestartScript).toContain('writeRestartIntent');
  expect(forceRestartScript).toContain('requestRuntimeRestartFallback');
  expect(forceRestartScript).toContain("cooperative full restart unavailable; trying runtime restart fallback");
  expect(forceRestartScript).toContain("runtime restart fallback unavailable; falling back to process stop");
  expect(forceRestartScript).toContain('acceptTrustedCurrentRuntime');
  expect(forceRestartScript).toContain('runtimeHead !== currentHeadValue');
  expect(fullRestartScript).toContain('if (!state?.shellPid && !state?.runtimePid)');
  expect(fullRestartScript).toContain('if (shellPid && !await waitForProcessExit');
  expect(script).toContain('readClientState');
  expect(script).toContain('restartRuntimeClient');
  expect(runtimeRestartScript).toContain('requestControlledRuntimeRestart');
  expect(runtimeRestartScript).toContain('waitForControlledRuntimeReady');
  expect(runtimeRestartScript).toContain('controlled runtime restart unavailable; falling back to process restart');
  expect(script).toContain('startup health check failed: ${failureReason} shell_pid=');
  expect(script).toContain('const ready = await waitForReady(session, shellPid)');
  expect(script).toContain('lastError: failureReason');
  expect(script).toContain('startup health check failed: ${failureReason}');
  expect(script).toContain('if (nativeState.processAlive(shellPid))');
  expect(script).toContain('await nativeState.removeClientState(stateFile);');
  expect(script).not.toContain('ready ??= readReadyState()');
  expect(restartScript).not.toContain('forced-cleanup');
  expect(script).toContain('recoverClientStateFromReady');
  expect(recoveredStateScript).toContain('ready.appReady.head ?? state?.head');
  expect(recoveredStateScript).toContain('if (!ready)');
  expect(recoveredStateScript).toContain('failedAt: undefined');
  expect(script).toContain('recoverClientStateFromStatus');
  expect(recoveredStateScript).toContain('runtimePid: ready.windowVisible.pid');
  expect(script).toContain('resetMarkers');
  expect(script).toContain('windowVisibleFile');
  expect(stateReadersScript).toContain('nativeState.readReadyState({');
  expect(stateReadersScript).toContain('appReadyFile, bridgeReadyFile, windowVisibleFile');
  expect(script).not.toContain('.pipe(logs.');
  expect(script).not.toContain('restart-electron-dev.ps1');
  expect(script).not.toContain('buildPowerShellArgs');
});

it('routes the clickable Windows launcher through native preview', async () => {
  const launcher = await readFile(path.resolve(process.cwd(), 'scripts/windows/start-foliole.cmd'), 'utf8');

  expect(launcher).toContain('set "FOLIOLE_REPO_ROOT=%~dp0..\\.."');
  expect(launcher).toContain('cd /d "%FOLIOLE_REPO_ROOT%"');
  expect(launcher).toContain('if "%FOLIOLE_ACTION%"=="" set "FOLIOLE_ACTION=start"');
  expect(launcher).toContain('if /i "%FOLIOLE_ACTION%"=="dev" set "FOLIOLE_ACTION=start"');
  expect(launcher).toContain('if /i "%FOLIOLE_ACTION%"=="dev-direct"');
  expect(launcher).toContain('npm.cmd run windows:preview:native');
  expect(launcher).toContain('npm run windows:client:native -- %FOLIOLE_ACTION%');
});

it('uses the WSL supplied runtime head before falling back to mirror git', async () => {
  const script = await readFile(path.resolve(process.cwd(), 'scripts/windows/windows-client-native-head.mjs'), 'utf8');

  expect(script).toContain('const envHead = env.FOLIOLE_RUNTIME_HEAD?.trim();');
  expect(script).toContain('if (envHead) return envHead;');
  expect(script.indexOf('if (envHead) return envHead;')).toBeLessThan(
    script.indexOf("runCapture('git', ['rev-parse', 'HEAD']")
  );
});
