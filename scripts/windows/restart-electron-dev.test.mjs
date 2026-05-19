import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

const SCRIPT_PATH = path.resolve(process.cwd(), 'scripts/windows/restart-electron-dev.ps1');
const NATIVE_ABI_PREFLIGHT_PATH = path.resolve(process.cwd(), 'scripts/windows/native-abi-preflight.ps1');

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

    expect(script).toContain('-ArgumentList "/d", "/c", $command');
    expect(script).toContain('-WindowStyle Hidden');
    expect(script).toContain('set PATHEXT=.COM;.EXE;.BAT;.CMD;.PS1');
    expect(script).toContain('electron:dev shell launched in hidden terminal');
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
    expect(preflight).toContain("$env:ELECTRON_RUN_AS_NODE = \"1\"");
    expect(preflight).toContain('foliole-native-module-preflight.js');
    expect(preflight).toContain("Replace('\\', '/')");
    expect(preflight).toContain('node_modules\\better-sqlite3');
    expect(preflight).toContain("require('$betterSqliteModulePath');");
    expect(preflight).toContain('& $electronPath $preflightScript');
    expect(preflight).toContain('$exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }');
    expect(preflight).toContain('native module preflight failed: better-sqlite3 load failed');
    expect(preflight).toContain('restore better-sqlite3 for the Electron ABI');
  });
});
