import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

const SCRIPT_PATH = path.resolve(process.cwd(), 'scripts/windows/restart-electron-dev.ps1');
const NATIVE_ABI_PREFLIGHT_PATH = path.resolve(process.cwd(), 'scripts/windows/native-abi-preflight.ps1');
const WINDOW_VISIBLE_HEALTH_PATH = path.resolve(process.cwd(), 'scripts/windows/native-window-visible-health.ps1');

describe('restart-electron-dev script', () => {
  it('matches the nested electron main entry command line used by Windows dev runtime', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('Get-Process -Name "electron" -ErrorAction SilentlyContinue');
    expect(script).toContain('Test-ProcessMatchesExpectedRuntime -Process $candidate -ExpectedRuntimePath $expectedRuntimePath');
  });

  it('reports structured trust status for running and stopped client states', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('status: RUNNING trust=OK');
    expect(script).toContain('status: STOPPED trust=FAILED reason=');
    expect(script).toContain('status: STOPPED trust=FAILED reason=no-runtime');
    expect(script).toContain('reason = "window-not-responding"');
    expect(script).toContain('responding=$($ReadyState.responding)');
  });

  it('reports discarded untrusted runtimes with trust details', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('discarded untrusted runtime trust=FAILED pid=');
    expect(script).toContain('marker_session=');
    expect(script).toContain('bridge_marker_session=');
  });

  it('does not classify a sole runtime candidate as stale when tracking metadata is missing', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('if ($candidates.Count -eq 1) {');
    expect(script).toContain('return @()');
    expect(script).toContain('function Get-ElectronRuntimeProcess');
    expect(script).toContain('function Get-ManagedRuntimeProcess');
  });

  it('skips global runtime scans when no tracked windows client state exists', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('function Test-ShouldScanRuntimeCandidates');
    expect(script).toContain('function Get-ManagedRuntimeProcess');
    expect(script).toContain('if (-not (Test-ShouldScanRuntimeCandidates -WorkDir $WorkDir -ExpectedSession $ExpectedSession)) {');
    expect(script).toContain('$runtime = Get-ManagedRuntimeProcess -WorkDir $WindowsWorkDir -ExpectedSession $runtimeSession');
    expect(script).toContain('if (Test-HasTrackedClientState) {');
    expect(script).toContain('Stop-StaleFolioleDevProcesses -WorkDir $WorkDir');
    expect(script).toContain('Get-ReadyMarkerRuntimeProcess -WorkDir $WorkDir -ExpectedSession $ExpectedSession');
  });

  it('accepts a single matching runtime candidate during startup before ready markers land', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('function Wait-ElectronHealthy');
    expect(script).toContain('$runtimeCandidates = @(Get-ElectronRuntimeCandidates -WorkDir $WorkDir)');
    expect(script).toContain('if ($runtimeCandidates.Count -eq 1) {');
    expect(script).toContain('$runtime = $runtimeCandidates[0]');
  });

  it('bounds taskkill waits so full restarts cannot hang indefinitely on process teardown', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('function Get-TaskkillTimeoutSeconds');
    expect(script).toContain('Start-Process -FilePath "taskkill.exe"');
    expect(script).toContain('Wait-Process -Id $taskkill.Id -Timeout (Get-TaskkillTimeoutSeconds)');
    expect(script).toContain('taskkill timeout pid=');
    expect(script).toContain('process still running after forced stop pid=');
  });

  it('launches the dev shell without a foreground terminal window', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('-FilePath $npmCmd');
    expect(script).toContain('-ArgumentList "run", "electron:dev"');
    expect(script).toContain('-WindowStyle Hidden');
    expect(script).toContain('-RedirectStandardOutput $stdoutLog');
    expect(script).toContain('-RedirectStandardError $stderrLog');
    expect(script).toContain('$env:PATHEXT = ".COM;.EXE;.BAT;.CMD;.PS1"');
    expect(script).toContain('Remove-Item Env:\\ELECTRON_RUN_AS_NODE');
    expect(script).toContain('electron:dev launched without a foreground terminal');
  });

  it('requires a visible window marker before native preview reports ready', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');
    const windowVisibleHealth = await readFile(WINDOW_VISIBLE_HEALTH_PATH, 'utf8');

    expect(script).toContain('$WindowVisibleHealthScript = Join-Path $PSScriptRoot "native-window-visible-health.ps1"');
    expect(script).toContain('. $WindowVisibleHealthScript');
    expect(windowVisibleHealth).toContain('function Resolve-WindowVisibleMarkerPath');
    expect(windowVisibleHealth).toContain('".windows-native-window-visible.json"');
    expect(windowVisibleHealth).toContain('function Wait-WindowVisibleMarker');
    expect(windowVisibleHealth).toContain('Test-RuntimeWindowVisible -WorkDir $WorkDir -RuntimePid $RuntimePid -ExpectedSession $ExpectedSession');
    expect(windowVisibleHealth).toContain('return @{ ok = $false; reason = "window-visible-timeout" }');
    expect(script).toContain('startup health check failed: $($windowVisible.reason)');
  });

  it('keeps stale-process cleanup scoped to the Electron dev loop', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).not.toContain('foliole-tauri-core');
    expect(script).not.toContain("^cargo(?:\\.exe)?$");
    expect(script).not.toContain('.*tauri');
  });

  it('preflights native modules with Electron before waiting for app-ready markers', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');
    const preflight = await readFile(NATIVE_ABI_PREFLIGHT_PATH, 'utf8');

    expect(script).toContain('$NativeAbiPreflightScript = Join-Path $PSScriptRoot "native-abi-preflight.ps1"');
    expect(script).toContain('. $NativeAbiPreflightScript');
    expect(script).toContain('Assert-NativeModulesLoadInElectron -WorkDir $WorkDir');
    expect(preflight).toContain('function Assert-NativeModulesLoadInElectron');
    expect(preflight).toContain('node_modules\\electron\\dist\\electron.exe');
    expect(preflight).toContain('scripts\\electron-sqlite-runner.mjs');
    expect(preflight).toContain('& node $runnerPath --preflight');
    expect(preflight).toContain('$exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }');
    expect(preflight).toContain('native module preflight failed: better-sqlite3 load failed');
    expect(preflight).toContain('restore better-sqlite3 for the Electron ABI');
  });
});
